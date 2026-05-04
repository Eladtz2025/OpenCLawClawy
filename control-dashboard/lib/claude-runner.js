// Claude Code task runner.
// Spawns `claude --print` as a child process, streams stdout/stderr to both
// a per-task append-only log file and a JSON state file, exposes task
// management via in-memory map.
//
// Modes:
//   plan   — `--permission-mode plan`        (read/think only; no edits, no shell)
//   safe   — `--permission-mode acceptEdits` plus a tight --allowedTools allowlist
//   full   — `--permission-mode acceptEdits` (no allowedTools restriction;
//             still NEVER passes --dangerously-skip-permissions — Claude will
//             stall on shell commands that are not auto-approved)
//   auto   — `--dangerously-skip-permissions` — same autonomy as the
//             interactive PowerShell session: Claude can run commands,
//             edit files, restart services, retry, debug, etc. without
//             stopping for prompts. Cwd is still pinned under WORKSPACE.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const { spawn, execFileSync } = require('child_process');
const { DASHBOARD_ROOT, WORKSPACE, logAction } = require('./runtime');

// Bumped whenever the runner gains a backend-visible capability the UI cares
// about (stuck detection, force kill, restart, diagnostics, etc.).
const RUNNER_VERSION = '2026-05-04.2';

const TASKS_DIR = path.join(DASHBOARD_ROOT, 'state', 'claude-tasks');
fs.mkdirSync(TASKS_DIR, { recursive: true });

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'C:\\Users\\Itzhak\\.local\\bin\\claude.exe';
const DEFAULT_CWD = WORKSPACE;
// Inline JSON state keeps a recent tail for quick views; the .log file is the
// authoritative full transcript.
const MAX_INLINE_OUTPUT_BYTES = 200 * 1024;
const PERSIST_THROTTLE_MS = 1000;

// Stuck/long-running thresholds. The runtime ones the UI uses are passed in
// per request via getTaskWithHealth(), so the user can tweak them without
// restarting the server. These are the defaults.
const DEFAULT_STUCK_AFTER_MS = 90 * 1000;
const DEFAULT_SOFT_WARN_MS   = 5 * 60 * 1000;
const DEFAULT_HARD_WARN_MS   = 15 * 60 * 1000;

const SAFE_ALLOWED_TOOLS = [
  'Read', 'Glob', 'Grep', 'Edit', 'Write', 'WebFetch',
  // Read-only shell commands only:
  'Bash(ls *)', 'Bash(cat *)', 'Bash(echo *)',
  'Bash(node *)', 'Bash(python *)', 'Bash(npm run *)',
  'Bash(git status)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)',
  'Bash(curl --silent *)', 'Bash(curl -sS *)',
  'Bash(npx *)'
];

const VALID_MODES = ['plan', 'safe', 'full', 'auto'];

// In-memory map of running tasks: taskId → { child, task, emitter, watcher }.
// The emitter fires 'append' (chunk text) and 'end' (final task object) so
// the SSE endpoint can stream without polling.
const running = new Map();

function logPath(id, kind) {
  // kind: 'stdout' | 'stderr'
  return path.join(TASKS_DIR, `${id}.${kind}.log`);
}
function statePath(id) {
  return path.join(TASKS_DIR, `${id}.json`);
}

function listTasks(limit = 30) {
  let names;
  try { names = fs.readdirSync(TASKS_DIR); } catch { return []; }
  const tasks = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, n), 'utf8'));
      tasks.push({
        id: t.id, mode: t.mode, status: t.status,
        createdAt: t.createdAt, endedAt: t.endedAt, exitCode: t.exitCode,
        pid: t.pid || null,
        lastOutputAt: t.lastOutputAt || null,
        prompt: (t.prompt || '').slice(0, 160)
      });
    } catch {}
  }
  return tasks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, limit);
}

function getTask(id) {
  try { return JSON.parse(fs.readFileSync(statePath(id), 'utf8')); } catch { return null; }
}

// Like getTask but augments with computed health fields the UI uses for stuck
// detection and time-warnings. None of these are persisted because the
// thresholds are caller-controlled.
function getTaskWithHealth(id, opts = {}) {
  const t = getTask(id);
  if (!t) return null;
  return augmentHealth(t, opts);
}

function augmentHealth(t, opts = {}) {
  const stuckAfterMs = opts.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;
  const softWarnMs   = opts.softWarnMs   ?? DEFAULT_SOFT_WARN_MS;
  const hardWarnMs   = opts.hardWarnMs   ?? DEFAULT_HARD_WARN_MS;

  const inMemory = running.has(t.id);
  // A task whose state file says 'running' but is not in our in-memory map
  // belongs to a previous server lifetime — recoverOrphans() should already
  // have flipped it. Treat it as not-actually-running for health purposes.
  const isRunning = t.status === 'running' && inMemory;

  const startTs = new Date(t.startedAt || t.createdAt).getTime();
  const endTs = t.endedAt ? new Date(t.endedAt).getTime() : Date.now();
  const elapsedMs = Math.max(0, endTs - startTs);

  const lastStdoutTs = t.lastStdoutAt ? new Date(t.lastStdoutAt).getTime() : null;
  const lastStderrTs = t.lastStderrAt ? new Date(t.lastStderrAt).getTime() : null;
  const lastFileTs   = t.lastFileChangeAt ? new Date(t.lastFileChangeAt).getTime() : null;
  const lastAnyTs = Math.max(lastStdoutTs || 0, lastStderrTs || 0, lastFileTs || 0) || null;

  const referenceTs = lastAnyTs || startTs;
  const staleMs = isRunning ? Math.max(0, Date.now() - referenceTs) : 0;
  const possiblyStuck = isRunning && staleMs >= stuckAfterMs;

  return {
    ...t,
    elapsedMs,
    staleMs,
    possiblyStuck,
    softWarn: isRunning && elapsedMs >= softWarnMs,
    hardWarn: isRunning && elapsedMs >= hardWarnMs,
    inMemory,
    runtimeStatus: isRunning ? 'running' : (t.status || 'unknown'),
    thresholds: { stuckAfterMs, softWarnMs, hardWarnMs }
  };
}

function writeTaskState(t) {
  try { fs.writeFileSync(statePath(t.id), JSON.stringify(t, null, 2), 'utf8'); }
  catch (e) { /* best-effort; live log file is authoritative */ }
}

function readLogSlice(id, kind, sinceBytes) {
  const p = logPath(id, kind);
  let stat;
  try { stat = fs.statSync(p); } catch { return { bytes: 0, text: '' }; }
  const start = Math.max(0, Math.min(sinceBytes || 0, stat.size));
  if (start >= stat.size) return { bytes: stat.size, text: '' };
  let text = '';
  try {
    const fd = fs.openSync(p, 'r');
    const len = stat.size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { /* ignore */ }
  return { bytes: stat.size, text };
}

// Read the last N lines from a log file. Returns an array of lines (no
// trailing newlines). Reads at most `cap` bytes from the tail to keep this
// cheap even for huge logs.
function readLogTailLines(id, kind, n = 20, cap = 64 * 1024) {
  const p = logPath(id, kind);
  let stat;
  try { stat = fs.statSync(p); } catch { return []; }
  const start = Math.max(0, stat.size - cap);
  let text = '';
  try {
    const fd = fs.openSync(p, 'r');
    const len = stat.size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch { return []; }
  // Drop a possibly partial leading line if we didn't start at 0.
  if (start > 0) {
    const nl = text.indexOf('\n');
    if (nl >= 0) text = text.slice(nl + 1);
  }
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-n);
}

function getEmitter(id) {
  const e = running.get(id);
  return e ? e.emitter : null;
}

function startTask({ prompt, mode = 'auto', cwd, model, effort, name }) {
  if (!prompt || !prompt.trim()) throw new Error('prompt required');
  if (!fs.existsSync(CLAUDE_BIN)) throw new Error(`claude CLI not found at ${CLAUDE_BIN}; set env CLAUDE_BIN`);
  if (!VALID_MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const taskCwd = cwd ? path.resolve(WORKSPACE, cwd) : DEFAULT_CWD;
  // Refuse cwds outside the workspace to keep blast radius small.
  if (!path.resolve(taskCwd).toLowerCase().startsWith(path.resolve(WORKSPACE).toLowerCase())) {
    throw new Error(`cwd must lie under ${WORKSPACE}`);
  }

  // Build args. Always --print (no TTY in dashboard).
  const args = ['--print'];
  if (mode === 'plan') {
    args.push('--permission-mode', 'plan');
  } else if (mode === 'safe') {
    args.push('--permission-mode', 'acceptEdits');
    args.push('--allowedTools', SAFE_ALLOWED_TOOLS.join(' '));
  } else if (mode === 'full') {
    args.push('--permission-mode', 'acceptEdits');
  } else {
    // auto: same autonomy as the interactive PowerShell Claude session.
    args.push('--dangerously-skip-permissions');
  }
  if (model)  args.push('--model', String(model));
  if (effort) args.push('--effort', String(effort));
  if (name)   args.push('--name', String(name));
  args.push('--no-session-persistence');

  // Open append-only log streams.
  const stdoutLog = fs.createWriteStream(logPath(id, 'stdout'), { flags: 'a' });
  const stderrLog = fs.createWriteStream(logPath(id, 'stderr'), { flags: 'a' });

  const startedAt = new Date().toISOString();
  const child = spawn(CLAUDE_BIN, args, {
    cwd: taskCwd,
    windowsHide: true,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdin.write(prompt);
  child.stdin.end();

  const emitter = new EventEmitter();
  emitter.setMaxListeners(64);

  let stdoutTail = '';
  let stderrTail = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let dirty = false;
  let lastWriteAt = 0;
  let writeTimer = null;
  // Set when the user explicitly asks for force-kill. Used by 'close' to
  // distinguish 'stopped' (graceful SIGTERM) from 'killed' (taskkill /F).
  let killReason = null;

  function persist(force) {
    const now = Date.now();
    if (!force && now - lastWriteAt < PERSIST_THROTTLE_MS) {
      if (!writeTimer) {
        writeTimer = setTimeout(() => {
          writeTimer = null;
          if (dirty) persist(true);
        }, PERSIST_THROTTLE_MS - (now - lastWriteAt));
      }
      return;
    }
    lastWriteAt = now;
    dirty = false;
    t.stdout = stdoutTail;
    t.stderr = stderrTail;
    t.stdoutBytes = stdoutBytes;
    t.stderrBytes = stderrBytes;
    writeTaskState(t);
  }

  child.stdout.on('data', (chunk) => {
    const s = String(chunk);
    stdoutLog.write(s);
    stdoutBytes += Buffer.byteLength(s, 'utf8');
    stdoutTail += s;
    if (stdoutTail.length > MAX_INLINE_OUTPUT_BYTES) stdoutTail = stdoutTail.slice(-MAX_INLINE_OUTPUT_BYTES);
    const ts = new Date().toISOString();
    t.lastOutputAt = ts;
    t.lastStdoutAt = ts;
    dirty = true;
    persist(false);
    emitter.emit('append', { kind: 'stdout', text: s, bytes: stdoutBytes, ts });
  });
  child.stderr.on('data', (chunk) => {
    const s = String(chunk);
    stderrLog.write(s);
    stderrBytes += Buffer.byteLength(s, 'utf8');
    stderrTail += s;
    if (stderrTail.length > MAX_INLINE_OUTPUT_BYTES) stderrTail = stderrTail.slice(-MAX_INLINE_OUTPUT_BYTES);
    const ts = new Date().toISOString();
    t.lastOutputAt = ts;
    t.lastStderrAt = ts;
    dirty = true;
    persist(false);
    emitter.emit('append', { kind: 'stderr', text: s, bytes: stderrBytes, ts });
  });

  // Best-effort recursive file watcher on the task cwd. Updates lastFileChangeAt
  // whenever Claude writes/edits a file. Watching the workspace root is
  // skipped because it's huge and noisy; for narrower cwds (e.g. a sub-app)
  // this gives a reliable second signal that work is still happening.
  let watcher = null;
  try {
    const isWorkspaceRoot = path.resolve(taskCwd).toLowerCase() === path.resolve(WORKSPACE).toLowerCase();
    if (!isWorkspaceRoot) {
      watcher = fs.watch(taskCwd, { recursive: true }, (eventType, filename) => {
        // Filter our own log writes — they live under TASKS_DIR which is
        // outside taskCwd, so this guard is just defensive.
        if (!filename) return;
        const ts = new Date().toISOString();
        t.lastFileChangeAt = ts;
        t.lastFileChangePath = String(filename);
        dirty = true;
        persist(false);
      });
      watcher.on('error', () => { try { watcher.close(); } catch {} watcher = null; });
    }
  } catch { /* watcher unavailable; lastFileChangeAt stays null */ }

  const t = {
    id, mode, prompt, cwd: taskCwd, model: model || null, effort: effort || null, name: name || null,
    command: [CLAUDE_BIN, ...args].join(' '),
    pid: child.pid || null,
    createdAt, startedAt, endedAt: null,
    lastOutputAt: null, lastStdoutAt: null, lastStderrAt: null,
    lastFileChangeAt: null, lastFileChangePath: null,
    status: 'running', exitCode: null, signal: null, killReason: null,
    stdout: '', stderr: '', stdoutBytes: 0, stderrBytes: 0,
    runnerVersion: RUNNER_VERSION
  };
  persist(true);

  child.on('close', (code, signal) => {
    try { stdoutLog.end(); } catch {}
    try { stderrLog.end(); } catch {}
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (watcher) { try { watcher.close(); } catch {} }
    t.endedAt = new Date().toISOString();
    t.exitCode = code;
    t.signal = signal || null;
    t.killReason = killReason;
    if (killReason === 'force') {
      t.status = 'killed';
    } else if (killReason === 'stop' || signal === 'SIGTERM' || signal === 'SIGKILL') {
      t.status = 'stopped';
    } else if (code === 0) {
      t.status = 'completed';
    } else {
      t.status = 'failed';
    }
    persist(true);
    emitter.emit('end', augmentHealth(t));
    running.delete(id);
    logAction({ alias: 'claude', name: 'task-' + t.status, taskId: id, exitCode: code, mode });
  });
  child.on('error', (err) => {
    try { stdoutLog.end(); } catch {}
    try { stderrLog.end(); } catch {}
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (watcher) { try { watcher.close(); } catch {} }
    t.endedAt = new Date().toISOString();
    t.status = 'failed';
    t.exitCode = -1;
    stderrTail += '\n[runner-error] ' + (err.message || String(err));
    t.stderr = stderrTail;
    persist(true);
    emitter.emit('end', augmentHealth(t));
    running.delete(id);
  });

  // Expose killReason setter so stop/forceKill can tag the close handler.
  const entry = {
    child, task: t, emitter, watcher,
    setKillReason: (r) => { killReason = r; }
  };
  running.set(id, entry);
  return { id, mode, status: 'running', startedAt, command: t.command, cwd: taskCwd, pid: child.pid };
}

function stopTask(id) {
  const entry = running.get(id);
  if (entry) {
    try {
      entry.setKillReason('stop');
      entry.child.kill('SIGTERM');
    } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true, id, status: 'stopping' };
  }
  // No in-memory entry. Either the task already ended, or the dashboard was
  // restarted while it was running and we lost track of the child. In the
  // latter case the on-disk state still says 'running' but stop has nothing
  // to kill — best-effort signal the orphan PID then mark the state.
  const t = getTask(id);
  if (!t) return { ok: false, error: 'task not found' };
  if (t.status !== 'running') return { ok: false, error: `task already ${t.status}` };
  if (t.pid) { try { process.kill(t.pid, 'SIGTERM'); } catch {} }
  t.status = 'orphaned';
  t.endedAt = new Date().toISOString();
  if (t.exitCode == null) t.exitCode = -1;
  writeTaskState(t);
  return { ok: true, id, status: 'orphaned', recovered: true };
}

// Kill the entire process tree (parent + children + grandchildren).
// `child.kill()` only signals the immediate child; on Windows that often
// leaves Claude's tool invocations (node, bash, curl, etc.) running. taskkill
// /T walks the tree and /F forces termination.
function forceKillTask(id) {
  const entry = running.get(id);
  let pid = entry && entry.task && entry.task.pid;
  let inMemory = !!entry;
  if (!pid) {
    const t = getTask(id);
    if (!t) return { ok: false, error: 'task not found' };
    if (t.status !== 'running') return { ok: false, error: `task already ${t.status}` };
    pid = t.pid;
    if (!pid) return { ok: false, error: 'no pid recorded' };
  }
  if (entry) entry.setKillReason('force');
  try {
    execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, timeout: 5000 });
  } catch (e) {
    return { ok: false, error: e.message, pid };
  }
  // For in-memory tasks the close handler will mark status. For orphans the
  // close handler is gone, so we mark the file directly.
  if (!inMemory) {
    const t = getTask(id);
    if (t) {
      t.status = 'killed';
      t.killReason = 'force';
      t.endedAt = new Date().toISOString();
      if (t.exitCode == null) t.exitCode = -1;
      writeTaskState(t);
    }
  }
  return { ok: true, id, pid, status: 'killed' };
}

// Re-spawn a previously-completed task with the same prompt/mode/cwd/model.
// Returns the newly-created task descriptor (new id).
function restartTask(id) {
  const t = getTask(id);
  if (!t) throw new Error('task not found');
  if (running.has(id)) throw new Error('task is still running; stop it before restarting');
  // cwd is stored absolute; convert back to a path relative to WORKSPACE so
  // startTask's allow-list check stays uniform.
  let relCwd;
  try {
    const r = path.relative(WORKSPACE, t.cwd || WORKSPACE);
    relCwd = r && !r.startsWith('..') ? r : undefined;
  } catch { relCwd = undefined; }
  return startTask({
    prompt: t.prompt,
    mode: t.mode,
    cwd: relCwd,
    model: t.model || undefined,
    effort: t.effort || undefined,
    name: t.name || undefined
  });
}

function isRunning(id) { return running.has(id); }

// Best-effort: confirm the recorded PID still belongs to a known image before
// signalling it. PIDs get recycled on Windows quickly; without this check, a
// stale `running` task could SIGTERM an unrelated process that happened to
// inherit the number after the dashboard restarted.
function pidImageMatches(pid, imageNames) {
  if (!pid) return null;
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 2000 }
    ).toString('utf8');
    const lower = out.trim().toLowerCase();
    for (const n of imageNames) {
      if (lower.startsWith(`"${n.toLowerCase()}"`)) return n;
    }
    return null;
  } catch { return null; }
}

function pidLooksLikeOurChild(pid) {
  return !!pidImageMatches(pid, ['node.exe', 'claude.exe']);
}

// Enumerate currently-live claude.exe processes with their executable path
// and parent pid (for the diagnostics panel). Uses WMI via PowerShell — slower
// than tasklist but the only way to get the full path. Cached for 10s so the
// dashboard's 5s diagnostics poll doesn't re-query every tick.
let _procCache = { ts: 0, procs: [] };
const PROC_CACHE_TTL_MS = 10 * 1000;

function listClaudeProcesses({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - _procCache.ts < PROC_CACHE_TTL_MS) return _procCache.procs;
  try {
    // Single PowerShell invocation; output as JSON so we don't need to parse
    // CSV by hand. Timeout 8s — WMI on a busy machine can be slow.
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name = 'claude.exe'\" | Select-Object ProcessId,ParentProcessId,ExecutablePath,CreationDate | ConvertTo-Json -Compress"
    ], { windowsHide: true, timeout: 8000 }).toString('utf8').trim();
    if (!out) { _procCache = { ts: now, procs: [] }; return []; }
    let parsed;
    try { parsed = JSON.parse(out); } catch { parsed = []; }
    if (!Array.isArray(parsed)) parsed = [parsed];
    const procs = parsed.map(p => ({
      pid: Number(p.ProcessId),
      ppid: Number(p.ParentProcessId),
      path: p.ExecutablePath || null,
      // CreationDate from CIM serializes as `/Date(<ms>)/` strings; pull the ms out.
      startedAtMs: (typeof p.CreationDate === 'string' ? Number((p.CreationDate.match(/\((\d+)\)/) || [])[1]) : null) || null
    }));
    _procCache = { ts: now, procs };
    return procs;
  } catch {
    // Fall back to plain tasklist (no path) so diagnostics still works.
    try {
      const out = execFileSync(
        'tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'],
        { windowsHide: true, timeout: 3000 }
      ).toString('utf8');
      const procs = [];
      for (const line of out.trim().split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)","(\d+)"/);
        if (!m) continue;
        procs.push({ pid: Number(m[2]), ppid: null, path: null, startedAtMs: null });
      }
      _procCache = { ts: now, procs };
      return procs;
    } catch { return []; }
  }
}

// Classify a claude.exe process by its executable path so the diagnostics
// panel can tell the difference between:
//   - dashboard-cli: the dashboard's own runner invocations of `claude.exe`
//                    from CLAUDE_BIN (currently `~/.local/bin/claude.exe`).
//                    These SHOULD all be tracked — anything from this image
//                    that isn't tracked is a real leak.
//   - desktop-app:   the user's Claude desktop app from WindowsApps.
//                    NEVER touch — it's the user's interactive UI.
//   - desktop-cli:   `claude-code` CLI shipped inside the Claude desktop app
//                    (under AppData/Roaming/Claude/claude-code/...).
//                    Could be the user's interactive PowerShell session.
//                    NEVER touch.
//   - other:         unrecognised path. Treat as external (don't auto-kill).
function classifyClaudeProcessByPath(execPath) {
  if (!execPath) return 'unknown-path';
  const p = execPath.toLowerCase();
  // CLAUDE_BIN may be elsewhere; compare against its dirname so future moves
  // (e.g. user updates CLAUDE_BIN) keep working.
  const binDir = path.dirname((CLAUDE_BIN || '').toLowerCase());
  if (binDir && p.startsWith(binDir)) return 'dashboard-cli';
  if (p.includes('\\windowsapps\\claude_'))                       return 'desktop-app';
  if (p.includes('\\appdata\\roaming\\claude\\claude-code\\'))    return 'desktop-cli';
  if (p.endsWith('\\.local\\bin\\claude.exe'))                    return 'dashboard-cli';
  return 'other';
}

// Called once at module load. Any task whose state file says 'running' is, by
// definition, not owned by this process (the in-memory map is empty at start).
// Send SIGTERM to the recorded PID *only if it still looks like our child*,
// then mark the file 'orphaned' so the UI stops showing a STOP button that does
// nothing.
function recoverOrphans() {
  let names;
  try { names = fs.readdirSync(TASKS_DIR); } catch { return; }
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    let t;
    try { t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, n), 'utf8')); } catch { continue; }
    if (t.status !== 'running') continue;
    if (t.pid && pidLooksLikeOurChild(t.pid)) {
      // Kill the whole tree to avoid leaving claude.exe + grandchildren
      // hanging around after a dashboard restart.
      try { execFileSync('taskkill', ['/T', '/F', '/PID', String(t.pid)], { windowsHide: true, timeout: 5000 }); }
      catch { try { process.kill(t.pid, 'SIGTERM'); } catch {} }
    }
    t.status = 'orphaned';
    t.endedAt = new Date().toISOString();
    if (t.exitCode == null) t.exitCode = -1;
    writeTaskState(t);
  }
}
recoverOrphans();

// Garbage-collect old task artefacts. Keep the newest N tasks (by createdAt
// from the state file, falling back to mtime) plus their sibling .log files.
// Anything older gets removed so the directory does not grow unbounded.
const MAX_KEEP_TASKS = 100;
function gcOldTasks() {
  let names;
  try { names = fs.readdirSync(TASKS_DIR); } catch { return; }
  const tasks = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const id = n.slice(0, -5);
    let createdAt = 0;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, n), 'utf8'));
      createdAt = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    } catch {}
    if (!createdAt) {
      try { createdAt = fs.statSync(path.join(TASKS_DIR, n)).mtimeMs; } catch {}
    }
    tasks.push({ id, createdAt });
  }
  tasks.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = tasks.slice(MAX_KEEP_TASKS);
  for (const t of toDelete) {
    for (const ext of ['.json', '.stdout.log', '.stderr.log']) {
      try { fs.unlinkSync(path.join(TASKS_DIR, t.id + ext)); } catch {}
    }
  }
}
gcOldTasks();

// Snapshot for the Claude Runner Diagnostics panel. Classifies live claude.exe
// processes by their executable path AND by whether they appear in a state
// file we wrote — so we don't mislabel the user's desktop app or interactive
// CLI session as "leaks". A *real leak* requires BOTH:
//   (a) the path is CLAUDE_BIN (or its dirname), AND
//   (b) the PID is recorded in a state file with status `running` or
//       `orphaned`, AND
//   (c) the PID is NOT in our in-memory `running` map (i.e. came from a
//       previous dashboard process).
// Without (b), a CLAUDE_BIN process is treated as the user's interactive
// session — we never auto-kill it.
function getDiagnostics(opts = {}) {
  const recent = listTasks(50).map(t => augmentHealth(t, opts));
  const active = recent.filter(t => t.runtimeStatus === 'running');
  const stuck = active.filter(t => t.possiblyStuck);
  const lastCompleted = recent.find(t => t.status === 'completed') || null;
  const lastFailed = recent.find(t => t.status === 'failed' || t.status === 'killed' || t.status === 'orphaned') || null;
  const trackedPids = new Set();
  for (const entry of running.values()) {
    if (entry.task && entry.task.pid) trackedPids.add(entry.task.pid);
  }
  // PIDs we ever wrote to a state file with status `running` or `orphaned` —
  // i.e. PIDs we know belong (or belonged) to dashboard-spawned tasks. The
  // runner only ever assigns its own child PIDs into these state files, so an
  // intersection with live processes gives us a high-confidence leak set.
  const dashboardPidSet = new Set();
  try {
    for (const n of fs.readdirSync(TASKS_DIR)) {
      if (!n.endsWith('.json')) continue;
      try {
        const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, n), 'utf8'));
        if ((t.status === 'running' || t.status === 'orphaned') && t.pid) {
          dashboardPidSet.add(t.pid);
        }
      } catch {}
    }
  } catch {}
  // Build classified buckets. Categories besides `dashboardLeak` are
  // informational only — never touched by cleanup.
  const all = listClaudeProcesses().map(p => ({
    ...p,
    pathKind: classifyClaudeProcessByPath(p.path),
    tracked: trackedPids.has(p.pid),
    inStateFile: dashboardPidSet.has(p.pid)
  }));
  const buckets = {
    tracked:       all.filter(p => p.tracked),
    // Real leak: path looks like ours AND PID is recorded in a state file
    // (was a dashboard task) AND not in current memory (from a past dashboard
    // process that crashed/restarted without cleanup).
    dashboardLeak: all.filter(p => !p.tracked && p.pathKind === 'dashboard-cli' && p.inStateFile),
    desktopApp:    all.filter(p => p.pathKind === 'desktop-app'),
    desktopCli:    all.filter(p => p.pathKind === 'desktop-cli'),
    // CLAUDE_BIN processes that aren't tracked AND aren't in any state file
    // are the user's interactive PowerShell Claude sessions. Counted under
    // "other" alongside any unclassified entries, never touched.
    other:         all.filter(p => !p.tracked
                                  && !(p.pathKind === 'dashboard-cli' && p.inStateFile)
                                  && p.pathKind !== 'desktop-app'
                                  && p.pathKind !== 'desktop-cli')
  };
  // Backwards-compatible field for old UI: untrackedClaudeProcesses now
  // contains ONLY real leaks, not the user's desktop app.
  const untrackedClaudeProcs = buckets.dashboardLeak;
  return {
    runnerVersion: RUNNER_VERSION,
    validModes: VALID_MODES,
    autoSupported: VALID_MODES.includes('auto'),
    defaultMode: 'auto',
    claudeBin: CLAUDE_BIN,
    claudeBinExists: fs.existsSync(CLAUDE_BIN),
    tasksDir: TASKS_DIR,
    activeCount: active.length,
    activeTasks: active,
    stuckCount: stuck.length,
    stuckTasks: stuck,
    lastCompleted, lastFailed,
    claudeProcessCount: all.length,
    trackedClaudePids: Array.from(trackedPids),
    untrackedClaudeProcesses: untrackedClaudeProcs,
    // New, classification-aware view. Old key kept for back-compat.
    processBuckets: {
      tracked: buckets.tracked.length,
      dashboardLeak: buckets.dashboardLeak.length,
      desktopApp: buckets.desktopApp.length,
      desktopCli: buckets.desktopCli.length,
      other: buckets.other.length
    },
    processBucketsDetail: {
      dashboardLeak: buckets.dashboardLeak.map(p => ({ pid: p.pid, ppid: p.ppid, path: p.path, startedAtMs: p.startedAtMs })),
      desktopApp:    buckets.desktopApp.map(p => ({ pid: p.pid, ppid: p.ppid })),
      desktopCli:    buckets.desktopCli.map(p => ({ pid: p.pid, ppid: p.ppid, path: p.path })),
      other:         buckets.other.map(p => ({ pid: p.pid, ppid: p.ppid, path: p.path }))
    },
    thresholds: {
      stuckAfterMs: opts.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS,
      softWarnMs:   opts.softWarnMs   ?? DEFAULT_SOFT_WARN_MS,
      hardWarnMs:   opts.hardWarnMs   ?? DEFAULT_HARD_WARN_MS
    },
    ts: new Date().toISOString()
  };
}

// Kill only the processes in the `dashboardLeak` bucket — i.e. claude.exe
// instances that came from CLAUDE_BIN but are not tracked by any in-memory
// task. The user's desktop app, desktop-bundled CLI, and any other CLI from
// outside CLAUDE_BIN are never touched by this function.
function cleanupDashboardLeaks() {
  // Refresh the cache before deciding what to kill — don't act on stale data.
  listClaudeProcesses({ force: true });
  const diag = getDiagnostics();
  const targets = (diag.processBucketsDetail && diag.processBucketsDetail.dashboardLeak) || [];
  const results = [];
  for (const p of targets) {
    try {
      execFileSync('taskkill', ['/T', '/F', '/PID', String(p.pid)], { windowsHide: true, timeout: 5000 });
      results.push({ pid: p.pid, ok: true });
    } catch (e) {
      results.push({ pid: p.pid, ok: false, error: (e && e.message || String(e)).slice(0, 200) });
    }
  }
  // Bust the proc cache so the next /api/claude/diagnostics call sees the new state.
  _procCache = { ts: 0, procs: [] };
  return {
    ok: true,
    targetedCount: targets.length,
    results,
    note: targets.length === 0
      ? 'No real leaks found. Desktop app and external CLI processes are intentionally not touched.'
      : `Killed ${results.filter(r => r.ok).length}/${targets.length} dashboard-cli leaks.`
  };
}

module.exports = {
  listTasks, getTask, getTaskWithHealth,
  startTask, stopTask, forceKillTask, restartTask,
  readLogSlice, readLogTailLines, getEmitter, isRunning,
  getDiagnostics, listClaudeProcesses, cleanupDashboardLeaks,
  CLAUDE_BIN, TASKS_DIR, VALID_MODES, RUNNER_VERSION,
  DEFAULT_STUCK_AFTER_MS, DEFAULT_SOFT_WARN_MS, DEFAULT_HARD_WARN_MS
};

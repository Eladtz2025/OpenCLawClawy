// Shared helpers for the Control Dashboard.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const WORKSPACE = path.resolve(os.homedir(), '.openclaw', 'workspace');
const DASHBOARD_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(DASHBOARD_ROOT, 'registry', 'systems.json');
const ACTION_LOG_PATH = path.join(DASHBOARD_ROOT, 'state', 'action-log.jsonl');
const ISSUE_ACKS_PATH = path.join(DASHBOARD_ROOT, 'state', 'issue-acks.json');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}
ensureDir(path.dirname(ACTION_LOG_PATH));

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function readJsonOpt(p) {
  try { return JSON.parse(stripBom(fs.readFileSync(p, 'utf8'))); } catch { return null; }
}

function readTextOpt(p, max = 4096) {
  try {
    const raw = stripBom(fs.readFileSync(p, 'utf8'));
    return raw.length > max ? raw.slice(0, max) + '\n…[truncated]' : raw;
  } catch { return null; }
}

function resolveWorkspacePath(rel) {
  // All paths in registry are relative to workspace root.
  if (!rel) return null;
  return path.resolve(WORKSPACE, rel);
}

// Rotate the action log when it grows past this many bytes. The previous
// generation is kept as `<file>.1` so recent history survives, but readers
// (and the dashboard's Activity page) only ever load the live file.
const ACTION_LOG_MAX_BYTES = 2 * 1024 * 1024;     // 2 MiB
const ACTION_LOG_TAIL_KEEP_BYTES = 512 * 1024;    // keep ~last 512 KiB inline so the page isn't empty

function rotateActionLogIfNeeded() {
  let st;
  try { st = fs.statSync(ACTION_LOG_PATH); } catch { return; }
  if (st.size < ACTION_LOG_MAX_BYTES) return;
  try {
    // Read the tail we want to preserve, then atomically replace.
    const fd = fs.openSync(ACTION_LOG_PATH, 'r');
    const start = Math.max(0, st.size - ACTION_LOG_TAIL_KEEP_BYTES);
    const len = st.size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    // Drop the (likely partial) first line.
    const nl = text.indexOf('\n');
    if (nl > -1) text = text.slice(nl + 1);
    const archive = ACTION_LOG_PATH + '.1';
    try { fs.renameSync(ACTION_LOG_PATH, archive); } catch {}
    fs.writeFileSync(ACTION_LOG_PATH, text, 'utf8');
  } catch { /* best-effort; next append still works */ }
}

let _actionLogAppendsSinceCheck = 0;
function logAction(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try { fs.appendFileSync(ACTION_LOG_PATH, line + '\n', 'utf8'); } catch {}
  // Cheap throttle: only stat the file every 50 appends.
  if (++_actionLogAppendsSinceCheck >= 50) {
    _actionLogAppendsSinceCheck = 0;
    rotateActionLogIfNeeded();
  }
}

function readActionLog({ limit = 200, alias, mode, status, since } = {}) {
  let raw;
  try { raw = fs.readFileSync(ACTION_LOG_PATH, 'utf8'); }
  catch { return []; }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (alias && entry.alias !== alias) continue;
    if (mode && entry.mode !== mode) continue;
    if (status === 'ok' && entry.ok !== true) continue;
    if (status === 'fail' && entry.ok !== false) continue;
    if (since && entry.ts && entry.ts < since) continue;
    out.push(entry);
  }
  return out;
}

function readIssueAcks() {
  const data = readJsonOpt(ISSUE_ACKS_PATH);
  if (!data || !Array.isArray(data.acks)) return { acks: [] };
  return data;
}

function writeIssueAcks(data) {
  try { fs.writeFileSync(ISSUE_ACKS_PATH, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { return { ok: false, error: e.message }; }
  return { ok: true };
}

function ackKeyFor(alias, issueText) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha1').update(String(issueText || '')).digest('hex').slice(0, 16);
  return `${alias}:${h}`;
}

function loadRegistry() {
  const raw = readJsonOpt(REGISTRY_PATH);
  if (!raw) throw new Error(`registry missing: ${REGISTRY_PATH}`);
  return raw;
}

function findSystem(alias) {
  const r = loadRegistry();
  return (r.systems || []).find(s => s.alias === alias) || null;
}

// Run a child process, capture output, with timeout. Never inherits stdio
// (we want all output as JSON for the API).
function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const timeoutMs = opts.timeoutMs ?? 120000;
    const cwd = opts.cwd || WORKSPACE;
    const env = { ...process.env, ...(opts.env || {}) };
    const startedAt = Date.now();
    const child = spawn(cmd, args, { cwd, env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const t = setTimeout(() => {
      killed = true;
      try { child.kill('SIGTERM'); } catch {}
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += String(d); });
    child.stderr.on('data', d => { stderr += String(d); });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({
        cmd: cmd + ' ' + args.join(' '),
        cwd,
        exit: code,
        durationMs: Date.now() - startedAt,
        timedOut: killed,
        stdout: stdout.slice(-32000),
        stderr: stderr.slice(-8000)
      });
    });
    child.on('error', (err) => {
      clearTimeout(t);
      resolve({
        cmd: cmd + ' ' + args.join(' '),
        cwd,
        exit: -1,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        stdout: '',
        stderr: String(err && err.message || err)
      });
    });
  });
}

module.exports = {
  WORKSPACE,
  DASHBOARD_ROOT,
  REGISTRY_PATH,
  ACTION_LOG_PATH,
  ISSUE_ACKS_PATH,
  stripBom,
  readJsonOpt,
  readTextOpt,
  resolveWorkspacePath,
  logAction,
  readActionLog,
  readIssueAcks,
  writeIssueAcks,
  ackKeyFor,
  loadRegistry,
  findSystem,
  runProcess
};

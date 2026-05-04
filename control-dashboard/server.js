#!/usr/bin/env node
// OpenClaw Control Dashboard — local-only HTTP server.
// Bound to 127.0.0.1 ONLY. Zero npm dependencies.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const {
  loadRegistry, findSystem, logAction, readJsonOpt, runProcess,
  readActionLog, readIssueAcks, writeIssueAcks, ackKeyFor
} = require('./lib/runtime');

const HOST = '127.0.0.1';
const PORT = Number(process.env.OPENCLAW_DASHBOARD_PORT || 7777);
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_DIR = path.join(__dirname, 'state');
const PID_FILE  = path.join(STATE_DIR, 'dashboard.pid');
const TASK_FILE = path.join(STATE_DIR, 'dashboard-task.json');
const SERVER_STARTED_AT = new Date().toISOString();

const PROVIDERS = {
  news:                     require('./providers/news'),
  organizer:                require('./providers/organizer'),
  'system-map':             require('./providers/system-map'),
  'traffic-law-appeal-il':  require('./providers/traffic-law-appeal-il')
};

const claudeRunner = require('./lib/claude-runner');
const remoteAccess = require('./lib/remote-access');
const telegramDispatch = require('./lib/telegram-dispatch');
const telegramTopics = require('./lib/telegram-topics');

const REMOTE_PORT = Number(process.env.OPENCLAW_REMOTE_PORT || remoteAccess.DEFAULT_REMOTE_PORT);
let remoteListener = null;

// --- helpers --------------------------------------------------------------
function send(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': typeof payload === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function isLocal(req) {
  const ra = req.socket && req.socket.remoteAddress;
  return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
}

function getProvider(system) {
  return PROVIDERS[system.providerModule] || null;
}

// Lazy + invalidatable cache of every absolute path the file viewer is allowed
// to read. Recomputing this on every /api/file hit was wasteful; the registry
// rarely changes and we re-stat it in case it does.
let _fileAllowCache = null;
function getFileAllowlist() {
  let regStat;
  const { REGISTRY_PATH, WORKSPACE } = require('./lib/runtime');
  try { regStat = fs.statSync(REGISTRY_PATH); } catch { regStat = null; }
  const stamp = regStat ? regStat.mtimeMs : 0;
  if (_fileAllowCache && _fileAllowCache.stamp === stamp) return _fileAllowCache.set;
  const reg = loadRegistry();
  const set = new Set();
  for (const sys of reg.systems || []) {
    for (const v of Object.values(sys.files || {})) {
      if (typeof v === 'string') set.add(path.resolve(WORKSPACE, v));
      else if (v && typeof v === 'object') {
        for (const sub of Object.values(v)) {
          if (typeof sub === 'string') set.add(path.resolve(WORKSPACE, sub));
        }
      }
    }
  }
  _fileAllowCache = { stamp, set };
  return set;
}

function readBody(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > max) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// --- static --------------------------------------------------------------
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg'
};

function serveStatic(req, res, urlPath) {
  // Only serve from public/. Strip leading slash; default index.html.
  let rel = urlPath.replace(/^\/+/, '');
  if (rel === '' || rel === 'index') rel = 'index.html';
  // refuse traversal
  if (rel.includes('..')) return send(res, 400, { error: 'invalid path' });
  const abs = path.join(PUBLIC_DIR, rel);
  if (!abs.startsWith(PUBLIC_DIR)) return send(res, 400, { error: 'invalid path' });
  fs.readFile(abs, (err, data) => {
    if (err) return send(res, 404, { error: 'not found', rel });
    const ext = path.extname(abs).toLowerCase();
    const headers = {
      'content-type': STATIC_TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    };
    // Dashboard HTML serves only same-origin assets, exchanges JSON with the
    // same origin, and opens the news public link as an external anchor — a
    // tight CSP is fine and contains any future XSS in renderMarkdown etc.
    if (ext === '.html') {
      headers['content-security-policy'] =
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'none'; " +
        "form-action 'self'";
      headers['x-frame-options'] = 'DENY';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

// --- routes --------------------------------------------------------------
async function route(req, res, ctx) {
  // ctx is provided by each listener wrapper. The local listener gates on
  // loopback; the remote listener gates on Tailscale IP + token. If neither
  // wrapper authorized the request, refuse it here as a final backstop.
  if (!ctx || !ctx.authorized) {
    return send(res, 403, { error: 'forbidden' });
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // health
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, ts: new Date().toISOString(), pid: process.pid });
  }

  // self-restart — fires the per-user scheduled-task control script.
  // Allowed from both listeners: the remote one is already gated by Tailscale
  // CGNAT + bearer token (same trust as any other write action).
  if (req.method === 'POST' && pathname === '/api/dashboard/restart') {
    const ps1 = path.join(__dirname, 'scripts', 'dashboard-service.ps1');
    if (!fs.existsSync(ps1)) {
      return sendJson(res, 500, { error: 'dashboard-service.ps1 missing', path: ps1 });
    }
    try {
      const { spawn } = require('child_process');
      // Detached so the child outlives us — Cmd-Restart will Stop-Process this pid,
      // then Cmd-Start launches a fresh node via the wscript launcher.
      const child = spawn('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, 'restart'
      ], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      logAction({ alias: 'dashboard', name: 'restart', mode: 'write', ok: true, pid: process.pid });
      return sendJson(res, 202, { ok: true, restarting: true, pid: process.pid });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // self-status (for the dashboard's own indicator)
  if (req.method === 'GET' && pathname === '/api/dashboard/self') {
    // dashboard-task.json is written by PowerShell with -Encoding UTF8 (BOM-prefixed).
    // Use readJsonOpt which strips BOM, so the UI gets a real `state`/`enabled`
    // payload instead of `{ error: "Unexpected token ﻿" }`.
    let task = readJsonOpt(TASK_FILE);
    if (!task && fs.existsSync(TASK_FILE)) task = { error: 'task file unparseable' };
    return sendJson(res, 200, {
      running: true,
      pid: process.pid,
      startedAt: SERVER_STARTED_AT,
      host: HOST,
      port: PORT,
      url: `http://${HOST}:${PORT}`,
      task
    });
  }

  // remote-access status (does not return the token)
  if (req.method === 'GET' && pathname === '/api/remote/status') {
    return sendJson(res, 200, {
      ...remoteAccess.getStatus(remoteListener),
      via: ctx.listener
    });
  }

  // registry
  if (req.method === 'GET' && pathname === '/api/systems') {
    try { return sendJson(res, 200, loadRegistry()); }
    catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  // per-system status
  let m = pathname.match(/^\/api\/system\/([a-z0-9-]+)\/status$/);
  if (req.method === 'GET' && m) {
    const alias = m[1];
    const sys = findSystem(alias);
    if (!sys) return sendJson(res, 404, { error: 'unknown alias', alias });
    const provider = getProvider(sys);
    if (!provider) return sendJson(res, 500, { error: 'no provider', alias });
    try {
      const data = await provider.status(sys);
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // per-system action
  m = pathname.match(/^\/api\/system\/([a-z0-9-]+)\/action\/([A-Za-z0-9._-]+)$/);
  if (req.method === 'POST' && m) {
    const alias = m[1];
    const name = m[2];
    const sys = findSystem(alias);
    if (!sys) return sendJson(res, 404, { error: 'unknown alias', alias });
    const actionDef = (sys.actions || []).find(a => a.name === name);
    if (!actionDef) return sendJson(res, 404, { error: 'unknown action', alias, name });
    const provider = getProvider(sys);
    if (!provider) return sendJson(res, 500, { error: 'no provider', alias });

    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }

    if (actionDef.requiresConfirmation && body.confirm !== true) {
      return sendJson(res, 412, { error: 'confirmation required', expectedBody: { confirm: true } });
    }

    const startedAt = Date.now();
    try {
      const result = await provider.action(sys, name);
      logAction({ alias, name, mode: actionDef.mode, durationMs: Date.now() - startedAt, ok: true });
      return sendJson(res, 200, { ok: true, alias, name, durationMs: Date.now() - startedAt, result });
    } catch (e) {
      logAction({ alias, name, mode: actionDef.mode, durationMs: Date.now() - startedAt, ok: false, error: e.message });
      return sendJson(res, 500, { ok: false, alias, name, error: e.message });
    }
  }

  // ---- Activity feed ----
  if (req.method === 'GET' && pathname === '/api/activity') {
    const q = parsed.query || {};
    const entries = readActionLog({
      limit: Math.min(Number(q.limit) || 200, 1000),
      alias: q.alias || undefined,
      mode: q.mode || undefined,
      status: q.status || undefined,
      since: q.since || undefined
    });
    return sendJson(res, 200, { entries });
  }

  // ---- Issue acknowledgements ----
  if (req.method === 'GET' && pathname === '/api/issues') {
    try {
      const reg = loadRegistry();
      const acks = readIssueAcks().acks;
      const ackMap = new Map(acks.map(a => [a.key, a]));
      const systems = (reg.systems || []).filter(getProvider);
      const statuses = await Promise.all(systems.map(sys =>
        getProvider(sys).status(sys).catch(() => null)
      ));
      const out = [];
      systems.forEach((sys, i) => {
        const s = statuses[i]; if (!s) return;
        for (const issueText of (s.issues || [])) {
          const key = ackKeyFor(sys.alias, issueText);
          const ack = ackMap.get(key) || null;
          out.push({
            key, alias: sys.alias, name: sys.name, headline: s.headline,
            issue: issueText, acknowledged: !!ack,
            ackedAt: ack ? ack.ackedAt : null,
            ackNote: ack ? ack.note : null
          });
        }
      });
      return sendJson(res, 200, { issues: out });
    } catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  if (req.method === 'POST' && pathname === '/api/issues/ack') {
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    if (!body.key) return sendJson(res, 400, { error: 'key required' });
    const data = readIssueAcks();
    const idx = data.acks.findIndex(a => a.key === body.key);
    const entry = {
      key: body.key,
      alias: body.alias || null,
      issue: body.issue || null,
      note: body.note || null,
      ackedAt: new Date().toISOString()
    };
    if (idx >= 0) data.acks[idx] = entry; else data.acks.push(entry);
    const w = writeIssueAcks(data);
    if (!w.ok) return sendJson(res, 500, w);
    logAction({ alias: body.alias || 'dashboard', name: 'ack-issue', mode: 'read', ok: true, key: body.key });
    return sendJson(res, 200, { ok: true, ack: entry });
  }

  if (req.method === 'POST' && pathname === '/api/issues/unack') {
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    if (!body.key) return sendJson(res, 400, { error: 'key required' });
    const data = readIssueAcks();
    const before = data.acks.length;
    data.acks = data.acks.filter(a => a.key !== body.key);
    const removed = before - data.acks.length;
    const w = writeIssueAcks(data);
    if (!w.ok) return sendJson(res, 500, w);
    logAction({ alias: body.alias || 'dashboard', name: 'unack-issue', mode: 'read', ok: true, key: body.key });
    return sendJson(res, 200, { ok: true, removed });
  }

  // ---- Command Center summary ----
  if (req.method === 'GET' && pathname === '/api/summary') {
    try {
      const reg = loadRegistry();
      const acks = new Set(readIssueAcks().acks.map(a => a.key));
      const systems = [];
      const allIssues = [];
      let worst = 'OK';
      const rank = { OK: 0, ATTENTION: 1, CRITICAL: 2, ERROR: 2 };
      let newsHoursSincePublish = null;
      let newsBuildId = null;
      let nextCronAt = null;
      let nextCronAlias = null;
      const sysList = (reg.systems || []).filter(getProvider);
      const statusResults = await Promise.all(sysList.map(sys =>
        getProvider(sys).status(sys).then(s => ({ ok: true, s }), e => ({ ok: false, err: e }))
      ));
      for (let i = 0; i < sysList.length; i++) {
        const sys = sysList[i];
        const r = statusResults[i];
        if (!r.ok) {
          systems.push({ alias: sys.alias, name: sys.name, headline: 'ERROR', error: r.err && r.err.message });
          worst = 'ERROR';
          continue;
        }
        const s = r.s;
        const head = s.headline || 'UNKNOWN';
        if ((rank[head] || 0) > (rank[worst] || 0)) worst = head;
        const sysIssues = (s.issues || []).map(t => ({
          alias: sys.alias, issue: t,
          key: ackKeyFor(sys.alias, t),
          acknowledged: acks.has(ackKeyFor(sys.alias, t))
        }));
        for (const i of sysIssues) allIssues.push(i);
        const firstRec = (s.recommendedNext || [])[0] || null;
        const recText = firstRec
          ? (typeof firstRec === 'string' ? firstRec : (firstRec.title ? `${firstRec.title}${firstRec.rationale ? ' — ' + firstRec.rationale : ''}` : JSON.stringify(firstRec)))
          : null;
        systems.push({
          alias: sys.alias, name: sys.name, headline: head,
          summary: s.summary || null,
          openIssues: sysIssues.filter(i => !i.acknowledged).length,
          ackedIssues: sysIssues.filter(i => i.acknowledged).length,
          recommendedNext: recText
        });
        if (sys.alias === 'news') {
          newsHoursSincePublish = s.hoursSincePublish ?? null;
          newsBuildId = s.lastBuildId || null;
          if (s.cron && s.cron.nextRunAt) {
            if (!nextCronAt || s.cron.nextRunAt < nextCronAt) {
              nextCronAt = s.cron.nextRunAt;
              nextCronAlias = sys.alias;
            }
          }
        }
      }
      const openIssues = allIssues.filter(i => !i.acknowledged);
      // worst recomputed from open (unacked) issues only — acked issues should not keep screaming
      let openWorst = 'OK';
      for (const sys of systems) {
        if (sys.openIssues > 0 && (rank[sys.headline] || 0) > (rank[openWorst] || 0)) openWorst = sys.headline;
      }
      // latest failed action
      const recentFailed = readActionLog({ limit: 1, status: 'fail' })[0] || null;
      // recommended next action across systems
      let topRecommendation = null;
      for (const sys of systems) {
        if (sys.openIssues > 0 && sys.recommendedNext) {
          topRecommendation = { alias: sys.alias, text: sys.recommendedNext };
          break;
        }
      }
      if (!topRecommendation) {
        for (const sys of systems) {
          if (sys.recommendedNext && !/no action needed/i.test(sys.recommendedNext)) {
            topRecommendation = { alias: sys.alias, text: sys.recommendedNext };
            break;
          }
        }
      }
      return sendJson(res, 200, {
        worstState: openWorst,
        rawWorstState: worst,
        openIssuesCount: openIssues.length,
        ackedIssuesCount: allIssues.length - openIssues.length,
        latestFailed: recentFailed,
        news: { hoursSincePublish: newsHoursSincePublish, buildId: newsBuildId },
        nextCron: nextCronAt ? { at: nextCronAt, alias: nextCronAlias } : null,
        recommendedNext: topRecommendation,
        systems,
        ts: new Date().toISOString()
      });
    } catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  // ---- Telegram command dispatch ----
  // Generic entry point for the future Telegram command bridge. The bridge
  // (a standalone poller process, or any other transport) parses the Telegram
  // message, then POSTs `{ command, args, fromUserId, replyToMessageId }`.
  // The dashboard maps `command` to a registered handler — currently only
  // `traffic`, which kicks off a Claude task with the Traffic-Law-Appeal-IL
  // start prompt.
  if (req.method === 'GET' && pathname === '/api/telegram/commands') {
    return sendJson(res, 200, { commands: telegramDispatch.listCommands() });
  }
  if (req.method === 'POST' && pathname === '/api/telegram/dispatch') {
    let body;
    try { body = JSON.parse((await readBody(req, 64 * 1024)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    try {
      const result = await telegramDispatch.dispatch(body, {
        claudeRunner, logAction,
        telegramTopics,
        // Provider lookup so commands like `/news status` can call the same
        // status() function the dashboard's UI calls — single source of truth.
        callSystemStatus: async (alias) => {
          const sys = require('./lib/runtime').findSystem(alias);
          if (!sys) throw new Error(`unknown alias: ${alias}`);
          const provider = PROVIDERS[sys.providerModule];
          if (!provider) throw new Error(`no provider for ${alias}`);
          return provider.status(sys);
        },
        callSystemAction: async (alias, name) => {
          const sys = require('./lib/runtime').findSystem(alias);
          if (!sys) throw new Error(`unknown alias: ${alias}`);
          const provider = PROVIDERS[sys.providerModule];
          if (!provider) throw new Error(`no provider for ${alias}`);
          return provider.action(sys, name);
        }
      });
      return sendJson(res, 200, result);
    } catch (e) {
      const status = e.userVisible ? 400 : 500;
      return sendJson(res, status, { error: e.message });
    }
  }

  // ---- Telegram topic registry ----
  // GET — list all aliases with computed routability.
  if (req.method === 'GET' && pathname === '/api/telegram/topics') {
    const reg = telegramTopics.loadRegistry();
    return sendJson(res, 200, {
      defaultGroupChatId: reg.defaultGroupChatId,
      ownerDmId: reg.ownerDmId ? `…${String(reg.ownerDmId).slice(-3)}` : null,
      topics: telegramTopics.listTopics(),
      updatedAt: reg.updatedAt
    });
  }

  // PATCH-ish: POST a partial update to a single alias. Only whitelisted
  // fields can change (see telegramTopics.updateAlias). Used for relabeling
  // (topic 537/967) and for assigning the traffic-law topic once known.
  let tm = pathname.match(/^\/api\/telegram\/topics\/([a-z0-9-]+)$/);
  if (req.method === 'POST' && tm) {
    let body;
    try { body = JSON.parse((await readBody(req, 16 * 1024)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    try {
      const updated = telegramTopics.updateAlias(tm[1], body);
      logAction({ alias: 'telegram', name: 'topic-relabel', mode: 'write', ok: true, target: tm[1] });
      return sendJson(res, 200, { ok: true, topic: updated });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // Send-by-alias — strictly gated. Body MUST include {confirm:true} and
  // an `intent` label that does not collide with the alias's blockedContent
  // (unless `force:true` is also set, for explicit "send this draft now"
  // requests). Refuses to send if the alias is not routable.
  tm = pathname.match(/^\/api\/telegram\/topics\/([a-z0-9-]+)\/send$/);
  if (req.method === 'POST' && tm) {
    let body;
    try { body = JSON.parse((await readBody(req, 64 * 1024)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    if (body.confirm !== true) {
      return sendJson(res, 412, { error: 'confirmation required', expectedBody: { confirm: true, text: '<text>', intent: '<short label>' } });
    }
    const r = await telegramTopics.sendByAlias({
      alias: tm[1],
      text: body.text,
      intent: body.intent || 'manual',
      confirm: true,
      force: body.force === true
    });
    logAction({ alias: 'telegram', name: `send:${tm[1]}`, mode: 'send', ok: r.ok, intent: body.intent || null });
    return sendJson(res, r.ok ? 200 : 400, r);
  }

  // ---- Claude Code task endpoints ----
  if (req.method === 'POST' && pathname === '/api/claude/run') {
    let body;
    try { body = JSON.parse((await readBody(req, 64 * 1024)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    if (body.confirm !== true) {
      return sendJson(res, 412, { error: 'confirmation required', expectedBody: { confirm: true, prompt: '<text>', mode: 'plan|safe|full' } });
    }
    try {
      const r = claudeRunner.startTask({
        prompt: body.prompt,
        // Default matches the UI default and the documented expectation that
        // dashboard tasks have the same autonomy as the interactive PowerShell
        // session (no permission stalls). UI passes mode explicitly; this is a
        // safety net for direct API callers (Telegram bridge, scripts).
        mode: body.mode || 'auto',
        cwd: body.cwd,
        model: body.model,
        effort: body.effort,
        name: body.name
      });
      logAction({ alias: 'claude', name: 'run', taskId: r.id, mode: r.mode });
      return sendJson(res, 200, r);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (req.method === 'GET' && pathname === '/api/claude/tasks') {
    const limit = parsed.query && parsed.query.limit ? Number(parsed.query.limit) : 30;
    return sendJson(res, 200, { tasks: claudeRunner.listTasks(limit) });
  }

  // Runtime diagnostics — counts of active/stuck/last-completed/last-failed
  // tasks, runner version, mode support, and classified claude.exe processes
  // (real leaks vs the user's desktop app vs external CLI). Cheap to call;
  // UI polls every few seconds.
  if (req.method === 'GET' && pathname === '/api/claude/diagnostics') {
    const q = parsed.query || {};
    return sendJson(res, 200, claudeRunner.getDiagnostics({
      stuckAfterMs: q.stuckAfterMs ? Number(q.stuckAfterMs) : undefined,
      softWarnMs:   q.softWarnMs   ? Number(q.softWarnMs)   : undefined,
      hardWarnMs:   q.hardWarnMs   ? Number(q.hardWarnMs)   : undefined
    }));
  }

  // Kill ONLY processes that look like real dashboard-spawned leaks
  // (claude.exe from CLAUDE_BIN that aren't tracked by any in-memory task).
  // Never touches the user's Claude desktop app or interactive CLI.
  if (req.method === 'POST' && pathname === '/api/claude/diagnostics/cleanup') {
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    if (body.confirm !== true) {
      return sendJson(res, 412, { error: 'confirmation required', expectedBody: { confirm: true } });
    }
    const r = claudeRunner.cleanupDashboardLeaks();
    logAction({ alias: 'claude', name: 'cleanup-leaks', mode: 'exec', ok: r.ok, targetedCount: r.targetedCount });
    return sendJson(res, 200, r);
  }

  let cm = pathname.match(/^\/api\/claude\/task\/([0-9a-f-]{36})$/);
  if (req.method === 'GET' && cm) {
    const q = parsed.query || {};
    const t = claudeRunner.getTaskWithHealth(cm[1], {
      stuckAfterMs: q.stuckAfterMs ? Number(q.stuckAfterMs) : undefined,
      softWarnMs:   q.softWarnMs   ? Number(q.softWarnMs)   : undefined,
      hardWarnMs:   q.hardWarnMs   ? Number(q.hardWarnMs)   : undefined
    });
    if (!t) return sendJson(res, 404, { error: 'task not found' });
    return sendJson(res, 200, t);
  }

  cm = pathname.match(/^\/api\/claude\/task\/([0-9a-f-]{36})\/stop$/);
  if (req.method === 'POST' && cm) {
    const r = claudeRunner.stopTask(cm[1]);
    logAction({ alias: 'claude', name: 'task-stop-request', taskId: cm[1], ok: r.ok });
    return sendJson(res, r.ok ? 200 : 400, r);
  }

  // Force-kill the entire process tree (taskkill /T /F). Use this when SIGTERM
  // is not enough — e.g. Claude is blocked in a child process that ignores it.
  cm = pathname.match(/^\/api\/claude\/task\/([0-9a-f-]{36})\/force-kill$/);
  if (req.method === 'POST' && cm) {
    const r = claudeRunner.forceKillTask(cm[1]);
    logAction({ alias: 'claude', name: 'task-force-kill', taskId: cm[1], ok: r.ok, pid: r.pid });
    return sendJson(res, r.ok ? 200 : 400, r);
  }

  // Restart a previously-completed task with the same prompt/mode/cwd. Returns
  // the new task descriptor so the UI can switch its selection.
  cm = pathname.match(/^\/api\/claude\/task\/([0-9a-f-]{36})\/restart$/);
  if (req.method === 'POST' && cm) {
    try {
      const r = claudeRunner.restartTask(cm[1]);
      logAction({ alias: 'claude', name: 'task-restart', sourceTaskId: cm[1], taskId: r.id, mode: r.mode });
      return sendJson(res, 200, r);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // Plain log slice — `?since=<bytes>&kind=stdout|stderr` returns text from
  // that byte offset onward. Used by the UI for incremental fetches when SSE
  // is not appropriate (initial load, completed tasks).
  cm = pathname.match(/^\/api\/claude\/task\/([0-9a-f-]{36})\/log$/);
  if (req.method === 'GET' && cm) {
    const id = cm[1];
    const since = Number((parsed.query && parsed.query.since) || 0) || 0;
    const kind = (parsed.query && parsed.query.kind) === 'stderr' ? 'stderr' : 'stdout';
    const slice = claudeRunner.readLogSlice(id, kind, since);
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-log-bytes': String(slice.bytes)
    });
    return res.end(slice.text);
  }

  // Server-Sent Events stream of live task output. Sends backlog from
  // `?since=<bytes>` (default 0), then live `append` events as the child
  // writes, then an `end` event with the final task JSON.
  cm = pathname.match(/^\/api\/claude\/task\/([0-9a-f-]{36})\/stream$/);
  if (req.method === 'GET' && cm) {
    const id = cm[1];
    const sinceOut = Number((parsed.query && parsed.query.sinceOut) || 0) || 0;
    const sinceErr = Number((parsed.query && parsed.query.sinceErr) || 0) || 0;
    const task = claudeRunner.getTaskWithHealth(id);
    if (!task) return sendJson(res, 404, { error: 'task not found' });

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no'
    });

    function sse(event, data) {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    }

    // 1. Send any backlog the client doesn't have yet.
    const outSlice = claudeRunner.readLogSlice(id, 'stdout', sinceOut);
    if (outSlice.text) sse('append', { kind: 'stdout', text: outSlice.text, bytes: outSlice.bytes });
    const errSlice = claudeRunner.readLogSlice(id, 'stderr', sinceErr);
    if (errSlice.text) sse('append', { kind: 'stderr', text: errSlice.text, bytes: errSlice.bytes });

    // 2. If the task is already finished, send `end` and close.
    const live = claudeRunner.getEmitter(id);
    if (!live) {
      sse('end', task);
      return res.end();
    }

    // 3. Live tail.
    const onAppend = (payload) => sse('append', payload);
    const onEnd = (finalTask) => { sse('end', finalTask); try { res.end(); } catch {} cleanup(); };
    // Real heartbeat event (not just an SSE comment) so the UI can update its
    // "alive X seconds ago" indicator and notice if the stream silently dies.
    const heartbeat = setInterval(() => {
      try {
        res.write(': hb\n\n');
        const fresh = claudeRunner.getTaskWithHealth(id);
        sse('heartbeat', {
          ts: new Date().toISOString(),
          status: fresh ? fresh.runtimeStatus : 'unknown',
          lastOutputAt: fresh ? fresh.lastOutputAt : null,
          staleMs: fresh ? fresh.staleMs : null,
          elapsedMs: fresh ? fresh.elapsedMs : null,
          possiblyStuck: fresh ? fresh.possiblyStuck : false,
          softWarn: fresh ? fresh.softWarn : false,
          hardWarn: fresh ? fresh.hardWarn : false
        });
      } catch {}
    }, 5000);
    function cleanup() {
      live.off('append', onAppend);
      live.off('end', onEnd);
      clearInterval(heartbeat);
    }
    live.on('append', onAppend);
    live.on('end', onEnd);
    req.on('close', cleanup);
    return;
  }

  // Reveal a path in Windows Explorer. Loopback-only (already enforced by
  // outer listener), and constrained to paths under the user's home directory
  // so we never open arbitrary system locations.
  if (req.method === 'POST' && pathname === '/api/reveal') {
    if (ctx && ctx.listener === 'remote') {
      return sendJson(res, 403, { error: 'reveal is local-only' });
    }
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    const target = body && typeof body.path === 'string' ? body.path : '';
    if (!target) return sendJson(res, 400, { error: 'path required' });
    const home = require('os').homedir();
    const resolved = path.resolve(target);
    if (!resolved.toLowerCase().startsWith(home.toLowerCase())) {
      return sendJson(res, 403, { error: 'path must be inside user home', home });
    }
    if (!fs.existsSync(resolved)) {
      return sendJson(res, 404, { error: 'path does not exist', path: resolved });
    }
    try {
      const { spawn } = require('child_process');
      // /select, highlights the file inside its parent folder
      spawn('explorer.exe', ['/select,', resolved], { detached: true, stdio: 'ignore' }).unref();
      return sendJson(res, 200, { ok: true, revealed: resolved });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ---- Study app state sync (yamaot30 etc.) ----
  // GET  /api/study/state/:appId       → { ok, state, updatedAt, etag }
  // PUT  /api/study/state/:appId       → body { state, expectedEtag? }
  // Storage: state/study/<appId>.json. App ids restricted to safe slug.
  // Allowed from both local and remote listeners (remote already gated by
  // Tailscale CGNAT + bearer token), so the user's phone on Tailscale can
  // sync against their workstation.
  let sm = pathname.match(/^\/api\/study\/state\/([a-z0-9][a-z0-9_-]{0,40})$/);
  if (sm) {
    const appId = sm[1];
    const studyDir = path.join(STATE_DIR, 'study');
    fs.mkdirSync(studyDir, { recursive: true });
    const statePath = path.join(studyDir, appId + '.json');
    if (req.method === 'GET') {
      try {
        const raw = fs.readFileSync(statePath, 'utf8');
        const obj = JSON.parse(raw);
        return sendJson(res, 200, { ok: true, ...obj });
      } catch (e) {
        if (e.code === 'ENOENT') return sendJson(res, 200, { ok: true, state: null, updatedAt: null, etag: null });
        return sendJson(res, 500, { error: e.message });
      }
    }
    if (req.method === 'PUT') {
      let body;
      try { body = JSON.parse((await readBody(req, 8 * 1024 * 1024)) || '{}'); }
      catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
      if (!body || typeof body.state !== 'object' || body.state === null) {
        return sendJson(res, 400, { error: 'state object required' });
      }
      // Optimistic concurrency: caller may pass expectedEtag. If it doesn't
      // match the on-disk etag, refuse and return current state so the
      // client can merge/resolve. Skipped if expectedEtag absent (force).
      let onDisk = null;
      try { onDisk = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
      if (body.expectedEtag != null && onDisk && onDisk.etag !== body.expectedEtag) {
        return sendJson(res, 409, { error: 'etag mismatch', current: onDisk });
      }
      const etag = require('crypto').randomBytes(8).toString('hex');
      const updatedAt = new Date().toISOString();
      const out = { state: body.state, updatedAt, etag };
      try { fs.writeFileSync(statePath, JSON.stringify(out), 'utf8'); }
      catch (e) { return sendJson(res, 500, { error: 'write failed: ' + e.message }); }
      logAction({ alias: 'study', name: 'state-write:' + appId, mode: 'write', ok: true, bytes: JSON.stringify(out).length });
      return sendJson(res, 200, { ok: true, etag, updatedAt });
    }
    if (req.method === 'DELETE') {
      try { fs.unlinkSync(statePath); } catch {}
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  // file viewer (path must be in registry's `files` blocks)
  if (req.method === 'GET' && pathname === '/api/file') {
    const requested = parsed.query && parsed.query.path;
    if (!requested) return sendJson(res, 400, { error: 'path required' });
    const allow = getFileAllowlist();
    if (!allow.has(path.resolve(requested))) {
      return sendJson(res, 403, { error: 'path not allowlisted', path: requested });
    }
    try {
      const text = fs.readFileSync(requested, 'utf8');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(text);
    } catch (e) { return sendJson(res, 404, { error: e.message }); }
    return;
  }

  // static
  if (req.method === 'GET') {
    return serveStatic(req, res, pathname);
  }

  send(res, 404, { error: 'not found', pathname });
}

// --- server --------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (!isLocal(req)) {
    return send(res, 403, { error: 'this dashboard accepts loopback connections only' });
  }
  route(req, res, { listener: 'local', authorized: true, user: 'local' }).catch(err => {
    try { send(res, 500, { error: err.message }); } catch {}
  });
});

function writePidFile() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify({
      pid: process.pid, startedAt: SERVER_STARTED_AT, host: HOST, port: PORT
    }, null, 2));
  } catch (e) { console.error('pid file write failed:', e.message); }
}
function removePidFile() { try { fs.unlinkSync(PID_FILE); } catch {} }

server.listen(PORT, HOST, () => {
  writePidFile();
  console.log(`OpenClaw Control Dashboard listening at http://${HOST}:${PORT} (pid ${process.pid})`);
  console.log(`(local only — non-loopback requests are rejected)`);

  // Best-effort: start the Tailscale-only remote listener. If no Tailscale
  // IP is detected or no token is configured, this stays off — the local
  // dashboard is unaffected.
  try {
    remoteListener = remoteAccess.start({
      route,
      port: REMOTE_PORT,
      log: (m) => console.log(m)
    });
    if (remoteListener.listening) {
      console.log(`OpenClaw remote (Tailscale-only) listening at ${remoteListener.url}`);
    } else {
      console.log(`OpenClaw remote disabled: ${remoteListener.reason}`);
    }
  } catch (e) {
    console.error(`remote listener failed to start: ${e.message}`);
    remoteListener = { listening: false, reason: 'start-error', error: e.message };
  }
});

function shutdown(code) {
  removePidFile();
  try { if (remoteListener && remoteListener.server) remoteListener.server.close(); } catch {}
  process.exit(code);
}
process.on('SIGINT',  () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', removePidFile);

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} already in use; set OPENCLAW_DASHBOARD_PORT=<free-port> and retry.`);
    process.exit(2);
  }
  throw err;
});

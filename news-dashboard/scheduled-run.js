#!/usr/bin/env node
// Windows-native daily runner for the News Dashboard.
//
// Replaces the Docker-dependent OpenClaw cron job
// "daily-news-dashboard-0730-israel-private". Designed to run from Windows
// Task Scheduler at 07:30 local time (machine TZ = Asia/Jerusalem).
//
// What it does:
//   1) runs morning-run.js (live-pipeline -> render -> publish -> verify)
//   2) reads news-dashboard/state.json to confirm publish succeeded
//   3) reads news-dashboard/telegram-summary.txt
//   4) sends the summary via control-dashboard/bin/send-via-gateway.js
//      with a buildId-derived idempotency key (same scheme as the dashboard's
//      "send-morning-ping-dm" action, so the two cannot duplicate)
//   5) writes the run status to control-dashboard/state/news-scheduled-task.json
//      so the dashboard + doctor.js can show last-run / next-run / lastError
//
// Idempotency:
//   - local check: if news-last-sent.json already has this buildId, skip send
//   - gateway check: idempotencyKey = sha1(buildId).slice(0,24); identical to
//     the dashboard provider so dual sends are de-duplicated server-side too
//
// Logs:
//   news-dashboard/scheduled-logs/<YYYY-MM-DD>.log (line-prefixed timestamps)
//
// Exit codes:
//   0 - pipeline ok and (sent OR skipped-as-duplicate OR skipped-no-summary)
//   1 - pipeline failed
//   2 - send failed (pipeline ok but Telegram send errored)
//
// Usage:
//   node scheduled-run.js [--skip-send]   (manual dry runs)

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const WORKSPACE = path.resolve(ROOT, '..');
const DASHBOARD_ROOT = path.join(WORKSPACE, 'control-dashboard');

const MORNING_RUN = path.join(ROOT, 'morning-run.js');
const STATE_PATH = path.join(ROOT, 'state.json');
const SUMMARY_TXT = path.join(ROOT, 'telegram-summary.txt');
const ALERT_TXT = path.join(ROOT, 'telegram-alert.txt');

const SEND_HELPER = path.join(DASHBOARD_ROOT, 'bin', 'send-via-gateway.js');
const LAST_SENT_PATH = path.join(DASHBOARD_ROOT, 'state', 'news-last-sent.json');
const TASK_STATUS_PATH = path.join(DASHBOARD_ROOT, 'state', 'news-scheduled-task.json');

const REGISTRY_PATH = path.join(DASHBOARD_ROOT, 'registry', 'systems.json');

const LOG_DIR = path.join(ROOT, 'scheduled-logs');

const SKIP_SEND = process.argv.includes('--skip-send');
const SKIP_PIPELINE = process.argv.includes('--skip-pipeline');  // for smoke tests only
const TASK_NAME = 'OpenClaw-NewsDashboard-Morning';

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------
function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function isoLocal() {
  return new Date().toISOString();
}

function logFilePath() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return path.join(LOG_DIR, `${y}-${m}-${day}.log`);
}

let LOG_FD = null;
function openLog() {
  ensureDir(LOG_DIR);
  LOG_FD = fs.openSync(logFilePath(), 'a');
}

function log(level, msg) {
  const line = `[${isoLocal()}] [${level}] ${msg}\n`;
  if (LOG_FD != null) {
    try { fs.writeSync(LOG_FD, line); } catch {}
  }
  process.stdout.write(line);
}

function stripBom(s) { return (s && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s; }

function readJsonOpt(p) {
  try { return JSON.parse(stripBom(fs.readFileSync(p, 'utf8'))); } catch { return null; }
}

function readTextOpt(p) {
  try { return stripBom(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

// ----------------------------------------------------------------------------
// task status (written for dashboard + doctor)
// ----------------------------------------------------------------------------
function loadTaskStatus() {
  return readJsonOpt(TASK_STATUS_PATH) || { taskName: TASK_NAME };
}

function saveTaskStatus(patch) {
  const cur = loadTaskStatus();
  const next = {
    taskName: TASK_NAME,
    schedule: { cronExpr: '30 7 * * *', tz: 'Asia/Jerusalem (machine local time)' },
    schedulerType: 'windows-task',
    ...cur,
    ...patch,
    updatedAt: isoLocal()
  };
  ensureDir(path.dirname(TASK_STATUS_PATH));
  writeJsonAtomic(TASK_STATUS_PATH, next);
}

function nextLocalRunAt0730Iso() {
  // Returns the next 07:30 in machine LOCAL time as an ISO string.
  const now = new Date();
  const next = new Date(now);
  next.setHours(7, 30, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

// ----------------------------------------------------------------------------
// step 1: run the local pipeline (Node only — no Docker)
// ----------------------------------------------------------------------------
function runMorningRun() {
  log('INFO', `running ${MORNING_RUN}`);
  const r = spawnSync(process.execPath, [MORNING_RUN], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 25 * 60 * 1000  // 25 minutes hard cap
  });
  if (r.stdout) {
    for (const line of r.stdout.split(/\r?\n/)) if (line) log('PIPE', line);
  }
  if (r.stderr) {
    for (const line of r.stderr.split(/\r?\n/)) if (line) log('PIPE-ERR', line);
  }
  if (r.error) log('ERR', `morning-run spawn error: ${r.error.message}`);
  return { exit: r.status, signal: r.signal, error: r.error ? String(r.error.message) : null };
}

// ----------------------------------------------------------------------------
// step 2: verify publish (state.json updated, has buildId, recent)
// ----------------------------------------------------------------------------
function verifyPublish() {
  const state = readJsonOpt(STATE_PATH);
  if (!state) return { ok: false, reason: 'state.json missing or invalid' };
  if (state.status !== 'SUCCESS') return { ok: false, reason: `state.status = ${state.status}`, state };
  if (!state.buildId) return { ok: false, reason: 'state.buildId missing', state };
  const ageMs = Date.now() - new Date(state.lastPublishedAt || 0).getTime();
  if (!isFinite(ageMs) || ageMs > 6 * 3600e3) {
    return { ok: false, reason: `state.lastPublishedAt is stale (${ageMs}ms old)`, state };
  }
  return { ok: true, state };
}

// ----------------------------------------------------------------------------
// step 3+4: send Telegram summary with buildId idempotency
// ----------------------------------------------------------------------------
function getDeliveryDmId() {
  const reg = readJsonOpt(REGISTRY_PATH);
  const news = (reg && reg.systems || []).find(s => s.alias === 'news');
  return (news && news.telegram && news.telegram.deliveryDmId) || null;
}

function sendSummary(buildId) {
  if (SKIP_SEND) return { ok: true, skipped: 'flag --skip-send' };

  const text = (readTextOpt(SUMMARY_TXT) || '').trim();
  if (!text) {
    log('WARN', 'telegram-summary.txt is empty — nothing to send');
    return { ok: true, skipped: 'empty summary' };
  }

  // Local idempotency check (matches dashboard provider).
  const lastSent = readJsonOpt(LAST_SENT_PATH) || {};
  if (lastSent.buildId === buildId) {
    log('INFO', `buildId ${buildId} already sent at ${lastSent.sentAt} (msg ${lastSent.gatewayMessageId || '?'}) — skipping send`);
    return { ok: true, duplicate: true, lastSent };
  }

  const dmId = getDeliveryDmId();
  if (!dmId) {
    return { ok: false, reason: 'cannot resolve deliveryDmId from registry/systems.json' };
  }

  // Same key shape as control-dashboard/providers/news.js -> server-side dedupe.
  const idempotencyKey = 'news:morning:' + crypto.createHash('sha1').update(buildId).digest('hex').slice(0, 24);

  log('INFO', `sending summary (${Buffer.byteLength(text, 'utf8')} bytes) via gateway → telegram:${dmId} key=${idempotencyKey}`);

  const r = spawnSync(process.execPath, [
    SEND_HELPER,
    '--channel', 'telegram',
    '--to', `telegram:${dmId}`,
    '--account', 'default',
    '--session-key', `agent:main:telegram:direct:${dmId}`,
    '--text-file', SUMMARY_TXT,
    '--idempotency-key', idempotencyKey
  ], { encoding: 'utf8', windowsHide: true, timeout: 60000 });

  let parsed = null;
  try {
    const m = (r.stdout || '').match(/\{[\s\S]*\}\s*$/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}

  if (r.status !== 0 || !parsed || !parsed.ok) {
    const stderr = (r.stderr || '').slice(-800);
    log('ERR', `gateway send failed exit=${r.status} stderr=${stderr}`);
    return {
      ok: false,
      reason: 'gateway send failed',
      exit: r.status,
      helperOutput: parsed || (r.stdout || '').slice(-500),
      stderr
    };
  }

  const messageId = (parsed.gatewayResult && parsed.gatewayResult.messageId) || null;
  const sentAt = isoLocal();

  // Persist last-sent so the dashboard + future runs see it.
  ensureDir(path.dirname(LAST_SENT_PATH));
  writeJsonAtomic(LAST_SENT_PATH, {
    buildId,
    sentAt,
    gatewayMessageId: messageId,
    idempotencyKey,
    target: { channel: 'telegram', to: `telegram:${dmId}`, sessionKey: `agent:main:telegram:direct:${dmId}` },
    textBytes: parsed.textBytes || null,
    sentBy: 'scheduled-run.js'
  });
  log('INFO', `sent ok messageId=${messageId} bytes=${parsed.textBytes}`);
  return { ok: true, sent: true, messageId, idempotencyKey, sentAt };
}

// Optional: send the alert file separately if non-empty (failure ping).
function maybeSendAlert(buildId) {
  if (SKIP_SEND) return null;
  const alertText = (readTextOpt(ALERT_TXT) || '').trim();
  if (!alertText) return null;
  const dmId = getDeliveryDmId();
  if (!dmId) return { ok: false, reason: 'no dmId' };
  const idempotencyKey = 'news:alert:' + crypto.createHash('sha1').update(buildId + '|' + alertText).digest('hex').slice(0, 24);
  log('INFO', `sending alert (${alertText.length} chars) key=${idempotencyKey}`);
  const r = spawnSync(process.execPath, [
    SEND_HELPER,
    '--channel', 'telegram',
    '--to', `telegram:${dmId}`,
    '--account', 'default',
    '--session-key', `agent:main:telegram:direct:${dmId}`,
    '--text-file', ALERT_TXT,
    '--idempotency-key', idempotencyKey
  ], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return { exit: r.status, stderr: (r.stderr || '').slice(-400) };
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
function main() {
  openLog();
  const startedAt = isoLocal();
  log('INFO', `=== scheduled-run start (skipSend=${SKIP_SEND}) ===`);

  saveTaskStatus({
    lastRunStartedAt: startedAt,
    lastStatus: 'running',
    nextRunAt: nextLocalRunAt0730Iso()
  });

  const pipeline = SKIP_PIPELINE ? { exit: 0, skipped: true } : runMorningRun();
  if (pipeline.exit !== 0) {
    log('ERR', `morning-run exited ${pipeline.exit}`);
    saveTaskStatus({
      lastRunEndedAt: isoLocal(),
      lastStatus: 'error',
      lastError: `morning-run exited ${pipeline.exit}${pipeline.error ? ' (' + pipeline.error + ')' : ''}`,
      lastDelivered: false,
      lastDeliveryStatus: 'pipeline-failed',
      consecutiveErrors: (loadTaskStatus().consecutiveErrors || 0) + 1
    });
    // Try to surface the alert text if morning-run wrote one
    const verify = verifyPublish();
    const buildId = (verify.state && verify.state.buildId) || 'unknown';
    maybeSendAlert(buildId);
    process.exit(1);
  }

  const verify = verifyPublish();
  if (!verify.ok) {
    log('ERR', `publish verification failed: ${verify.reason}`);
    saveTaskStatus({
      lastRunEndedAt: isoLocal(),
      lastStatus: 'error',
      lastError: `publish verification: ${verify.reason}`,
      lastDelivered: false,
      lastDeliveryStatus: 'verify-failed',
      consecutiveErrors: (loadTaskStatus().consecutiveErrors || 0) + 1
    });
    process.exit(1);
  }
  const buildId = verify.state.buildId;
  log('INFO', `pipeline ok, buildId=${buildId}`);

  const send = sendSummary(buildId);
  const finishedAt = isoLocal();
  if (!send.ok) {
    log('ERR', `send failed: ${send.reason || 'unknown'}`);
    saveTaskStatus({
      lastRunEndedAt: finishedAt,
      lastStatus: 'error',
      lastError: `send failed: ${send.reason || 'unknown'}`,
      lastBuildId: buildId,
      lastDelivered: false,
      lastDeliveryStatus: 'send-failed',
      lastSendDetail: send,
      consecutiveErrors: (loadTaskStatus().consecutiveErrors || 0) + 1
    });
    process.exit(2);
  }

  saveTaskStatus({
    lastRunEndedAt: finishedAt,
    lastStatus: 'ok',
    lastError: null,
    lastBuildId: buildId,
    lastDelivered: !!(send.sent || send.duplicate || send.skipped),
    lastDeliveryStatus: send.duplicate ? 'duplicate-skipped'
                       : send.skipped ? `skipped:${send.skipped}`
                       : 'delivered',
    lastSendMessageId: send.messageId || null,
    lastIdempotencyKey: send.idempotencyKey || null,
    consecutiveErrors: 0,
    nextRunAt: nextLocalRunAt0730Iso()
  });
  maybeSendAlert(buildId);
  log('INFO', `=== scheduled-run done OK buildId=${buildId} status=${send.duplicate ? 'duplicate' : send.skipped ? 'skipped' : 'sent'} ===`);
  process.exit(0);
}

try { main(); }
catch (e) {
  try { log('FATAL', `${e && e.stack || e}`); } catch {}
  try {
    saveTaskStatus({
      lastRunEndedAt: isoLocal(),
      lastStatus: 'error',
      lastError: `fatal: ${e && e.message || e}`,
      consecutiveErrors: (loadTaskStatus().consecutiveErrors || 0) + 1
    });
  } catch {}
  process.exit(1);
}

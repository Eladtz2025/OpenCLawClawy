#!/usr/bin/env node
// OpenClaw Telegram bridge — minimal long-poller.
//
// Polls a *dedicated* Telegram bot (its own token, separate from the main
// OpenClaw daemon's bot, so we don't fight over getUpdates), recognizes
// `/<command> [args]` messages, and dispatches them to the control
// dashboard's `/api/telegram/dispatch` endpoint. Replies (acks + final
// output) go back through the existing OpenClaw gateway via
// `control-dashboard/bin/send-via-gateway.js`.
//
// Hard limits:
//   - Only allowlisted user IDs may issue commands. Without an allowlist,
//     the bridge refuses every non-whitelisted sender.
//   - Reads its own token from `~/.openclaw/traffic-bridge.token`
//     (override via TRAFFIC_BRIDGE_TOKEN env var). Never logs the token.
//   - Talks to the dashboard ONLY over loopback.
//   - Polls one update at a time (long-poll timeout 25s) and persists the
//     last update id under `state/offset.json` so restarts don't re-process
//     old messages.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');

const BRIDGE_DIR = __dirname;
const STATE_DIR = path.join(BRIDGE_DIR, 'state');
const OFFSET_FILE = path.join(STATE_DIR, 'offset.json');
const CONFIG_FILE = path.join(BRIDGE_DIR, 'config.json');
// Token file path: prefer the bot-agnostic name; keep the legacy name as a
// fallback so older installs keep working without manual migration.
const TOKEN_FILE_PRIMARY  = path.join(os.homedir(), '.openclaw', 'claude-bridge.token');
const TOKEN_FILE_FALLBACK = path.join(os.homedir(), '.openclaw', 'traffic-bridge.token');
const SEND_VIA_GATEWAY = path.resolve(BRIDGE_DIR, '..', 'control-dashboard', 'bin', 'send-via-gateway.js');

const DASHBOARD_URL = process.env.OPENCLAW_DASHBOARD_URL || 'http://127.0.0.1:7777';
const POLL_TIMEOUT = 25; // seconds — Telegram getUpdates long-poll
const FINAL_OUTPUT_LIMIT = 3500; // chars — Telegram caps individual messages around 4096

fs.mkdirSync(STATE_DIR, { recursive: true });

// ---------------------------------------------------------------- config / args
function loadConfig() {
  // config.json is optional; without it the bridge runs with default
  // empty allowlist (refuses all senders, useful as a safety default).
  let cfg = {
    allowedUserIds: [],
    sessionKey: 'agent:traffic-law:telegram:bridge',
    accountId: 'default',
    threadId: null,
    botUsername: null,
    perUserRateLimitMs: 5000
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      cfg = { ...cfg, ...raw };
    }
  } catch (e) {
    log('WARN', `config.json unreadable: ${e.message}; using defaults`);
  }
  cfg.allowedUserIds = (cfg.allowedUserIds || []).map(String);
  return cfg;
}

function loadToken() {
  // Env override wins (in either name) so dev/test runs can swap bots
  // without touching the file system.
  for (const k of ['OPENCLAW_BRIDGE_TOKEN', 'TRAFFIC_BRIDGE_TOKEN']) {
    if (process.env[k]) {
      const t = process.env[k].trim();
      if (t) return t;
    }
  }
  // Then the on-disk file. Prefer the new bot-agnostic name; fall back to
  // the legacy `traffic-bridge.token` so existing installs keep booting.
  for (const p of [TOKEN_FILE_PRIMARY, TOKEN_FILE_FALLBACK]) {
    if (!fs.existsSync(p)) continue;
    try { return fs.readFileSync(p, 'utf8').replace(/^﻿/, '').trim(); }
    catch (e) { log('ERR', `cannot read ${p}: ${e.message}`); }
  }
  return null;
}

function readOffset() {
  try {
    const raw = JSON.parse(fs.readFileSync(OFFSET_FILE, 'utf8'));
    return Number(raw.lastUpdateId) || 0;
  } catch { return 0; }
}
function writeOffset(id) {
  try { fs.writeFileSync(OFFSET_FILE, JSON.stringify({ lastUpdateId: id, updatedAt: new Date().toISOString() }, null, 2)); }
  catch (e) { log('WARN', `offset write failed: ${e.message}`); }
}

// ---------------------------------------------------------------- logging
function log(level, msg) {
  const line = `[${new Date().toISOString()}] ${level} ${msg}`;
  process.stdout.write(line + '\n');
}

// ---------------------------------------------------------------- http helpers
function httpJson(method, urlStr, body, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: { 'content-type': 'application/json' }
    };
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    if (data) opts.headers['content-length'] = data.length;
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        resolve({ statusCode: res.statusCode, text, parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`timeout after ${timeoutMs}ms`)); });
    if (data) req.write(data);
    req.end();
  });
}

async function tg(token, method, params) {
  const u = `https://api.telegram.org/bot${token}/${method}`;
  const r = await httpJson('POST', u, params || {}, { timeoutMs: (POLL_TIMEOUT + 5) * 1000 });
  if (r.statusCode !== 200 || !r.parsed || r.parsed.ok !== true) {
    const err = new Error(`telegram ${method} failed (status ${r.statusCode}): ${r.text.slice(0, 300)}`);
    err.tgResponse = r.parsed;
    throw err;
  }
  return r.parsed.result;
}

// Direct sendMessage using the bridge's OWN bot token. This is what the bridge
// must use to make replies appear as its bot identity (@ClaudeClawyBot).
//
// IMPORTANT: an earlier version routed all bridge replies through the
// OpenClaw gateway (`bin/send-via-gateway.js`), which sends from
// `accountId=default`. That account is @Clawy_OpenClawBot — the unrelated
// main daemon bot. Result: the user typed /start to @ClaudeClawyBot,
// the bridge polled it correctly, but the welcome reply came back from
// @Clawy_OpenClawBot, making it look like the new bot was dead.
//
// `tgSendDirect` uses the same token the poller uses, so the from-bot is
// always the bot the user is talking to. It also returns sub-second
// (vs ~25s through the gateway+CLI shellout).
async function tgSendDirect(token, { chatId, threadId, text }) {
  const params = { chat_id: chatId, text };
  if (threadId != null && threadId !== '') params.message_thread_id = Number(threadId);
  try {
    const result = await tg(token, 'sendMessage', params);
    return { ok: true, messageId: result && result.message_id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Send via the existing OpenClaw gateway (so replies go through the same
// channel/account the rest of the system uses; we don't depend on a separate
// outbound implementation).
function sendViaGateway({ targetUserId, threadId, text, sessionKey, accountId }) {
  return new Promise((resolve) => {
    if (!fs.existsSync(SEND_VIA_GATEWAY)) {
      return resolve({ ok: false, error: `send-via-gateway.js missing at ${SEND_VIA_GATEWAY}` });
    }
    // Write text to a temp file — send-via-gateway.js takes --text-file.
    const tmp = path.join(STATE_DIR, `outgoing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
    try { fs.writeFileSync(tmp, text, 'utf8'); }
    catch (e) { return resolve({ ok: false, error: `temp write failed: ${e.message}` }); }
    const args = [
      SEND_VIA_GATEWAY,
      '--channel', 'telegram',
      '--to', `telegram:${targetUserId}`,
      '--account', accountId || 'default',
      '--session-key', sessionKey,
      '--text-file', tmp
    ];
    if (threadId != null && threadId !== '') {
      args.push('--threadId', String(threadId));
    }
    const child = spawn(process.execPath, args, { windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', d => { out += String(d); });
    child.stderr.on('data', d => { err += String(d); });
    child.on('close', (code) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (code === 0) {
        let parsed = null;
        try { const m = out.match(/\{[\s\S]*\}\s*$/); parsed = m ? JSON.parse(m[0]) : null; } catch {}
        resolve({ ok: true, gatewayResult: parsed });
      } else {
        resolve({ ok: false, exit: code, stderr: err.slice(0, 600), stdout: out.slice(0, 600) });
      }
    });
    child.on('error', (e) => {
      try { fs.unlinkSync(tmp); } catch {}
      resolve({ ok: false, error: e.message });
    });
  });
}

// ---------------------------------------------------------------- local commands
// Commands answered locally by the bridge — never round-tripped through the
// dashboard. /start and /help are the universal Telegram bot conventions:
// the dashboard's COMMANDS map doesn't know them, so dispatching them would
// return a 400 the user reads as "unknown command". Reply directly instead.
//
// SCOPE: this bridge is the Claude Code developer bridge ONLY. It exposes
// /claude, /dashboard, /topics. System-level commands (/news, /organizer,
// /traffic-law, /system-map) are owned by @Clawy_OpenClawBot in topics —
// not here.
const LOCAL_COMMANDS = {
  start: [
    'Claude Code dev bridge is ready (@ClaudeClawyBot).',
    '',
    'This bot is a developer bridge for the local Claude Code runner only.',
    'For system status / news / organizer / traffic-law, use @Clawy_OpenClawBot in the supergroup topics.',
    '',
    'Try one of:',
    '  /dashboard               — overall pulse across systems',
    '  /topics                  — list Telegram topic aliases',
    '  /claude Reply with PONG only',
    '',
    'For more: /help'
  ].join('\n'),
  help: [
    '@ClaudeClawyBot — Claude Code dev-bridge commands:',
    '',
    '  /dashboard               overall pulse (read-only)',
    '  /topics                  list Telegram topic aliases',
    '',
    'Claude Code runner',
    '  /claude <task>           run a Claude Code task locally',
    '  /claude status           runner version + active/leak counts',
    '  /claude stop             stop the most recent running task',
    '  /claude last             one-line summary of last task',
    '  /claude logs             last ~3KB stdout of last task',
    '',
    'Allowlist enforced — only your user ID can issue commands.',
    'System operations live in @Clawy_OpenClawBot (group topics).'
  ].join('\n')
};

// ---------------------------------------------------------------- command parser
function parseCommand(text, botUsername) {
  // Telegram-style: `/cmd@bot args...` or `/cmd args...`.
  if (typeof text !== 'string') return null;
  const m = text.match(/^\/([A-Za-z][A-Za-z0-9_]*)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const command = m[1].toLowerCase();
  const target = m[2] || null;
  const args = (m[3] || '').trim();
  if (botUsername && target && target.toLowerCase() !== botUsername.toLowerCase()) {
    return null; // mention is for a different bot
  }
  return { command, args };
}

// ---------------------------------------------------------------- task tracking
async function dispatchToDashboard(parsed, fromUserId, replyToMessageId) {
  const url = `${DASHBOARD_URL}/api/telegram/dispatch`;
  const r = await httpJson('POST', url, {
    command: parsed.command,
    args: parsed.args,
    fromUserId,
    replyToMessageId
  }, { timeoutMs: 15000 });
  if (r.statusCode !== 200) {
    const err = new Error(`dashboard returned ${r.statusCode}: ${r.text.slice(0, 200)}`);
    err.responseStatus = r.statusCode;
    err.responseText = r.text;
    throw err;
  }
  return r.parsed;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------- in-flight tasks
// Telegram-launched Claude tasks are tracked here so:
//   1. handleUpdate never has to await task completion (bridge keeps polling
//      Telegram for new messages — no more bridge-wide block).
//   2. /claude stop, /claude status, /claude last continue to work mid-task
//      (they go through the dashboard runner, but we ALSO hold metadata about
//      where to deliver the final reply).
//   3. Bridge restart can resume waiting on tasks that were in-flight (so
//      restart doesn't orphan the user — they still get the final reply).
//
// State file: state/in-flight-tasks.json
//   { tasks: [ { taskId, chatId, threadId, startedAt, lastProgressAt,
//                progressLevel, label } ], updatedAt }
//
// Each task gets one persistent watcher (a setTimeout chain). It polls the
// dashboard /api/claude/task/:id at PROGRESS_POLL_INTERVAL_MS, sends progress
// updates at the 5-min / 15-min / every-15-min thresholds, and on terminal
// status sends the final reply and removes from the in-flight registry.

const INFLIGHT_FILE = path.join(STATE_DIR, 'in-flight-tasks.json');
const PROGRESS_POLL_INTERVAL_MS = 5000;
const PROGRESS_THRESHOLDS_SEC = [5 * 60, 15 * 60, 30 * 60, 45 * 60, 60 * 60]; // when to send "still working…"
const HARD_BRIDGE_TIMEOUT_MS = 90 * 60 * 1000; // bridge gives up watching at 90 min; user can /claude logs to see what happened
const inFlightTasks = new Map(); // taskId → { ... }

function loadInflight() {
  try {
    const raw = JSON.parse(fs.readFileSync(INFLIGHT_FILE, 'utf8'));
    return Array.isArray(raw && raw.tasks) ? raw.tasks : [];
  } catch { return []; }
}
function saveInflight() {
  try {
    fs.writeFileSync(INFLIGHT_FILE, JSON.stringify({
      tasks: Array.from(inFlightTasks.values()),
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  } catch (e) { log('WARN', `inflight save failed: ${e.message}`); }
}

// Format the final reply for a terminal task state.
function formatFinalReply(task, label) {
  const stdoutTail = (task.stdout || '').slice(-FINAL_OUTPUT_LIMIT);
  const idShort = String(task.id || '').slice(0, 8);
  if (task.status === 'completed') {
    return `Task ${idShort} ${label ? '(' + label + ') ' : ''}completed.\n\n${stdoutTail.trim() || '(no stdout)'}`;
  }
  const stderrTail = (task.stderr || '').slice(-1000);
  return `Task ${idShort} ${label ? '(' + label + ') ' : ''}ended: status=${task.status}${task.exitCode != null ? ' exit=' + task.exitCode : ''}.\n\n${stdoutTail.trim() || stderrTail.trim() || '(no output)'}`;
}

// Spawn a background watcher for a task. Non-blocking — handleUpdate returns
// immediately. The watcher chains setTimeout calls so it never holds the
// event loop and survives concurrent watchers fine.
function trackTask({ taskId, chatId, threadId, label, ctx }) {
  const entry = {
    taskId, chatId, threadId, label: label || null,
    startedAt: new Date().toISOString(),
    lastProgressAt: null,
    progressLevel: 0
  };
  inFlightTasks.set(taskId, entry);
  saveInflight();
  startTaskWatcher(entry, ctx);
}

function startTaskWatcher(entry, ctx) {
  const startedAtMs = new Date(entry.startedAt).getTime();
  const taskUrl = `${DASHBOARD_URL}/api/claude/task/${entry.taskId}`;

  const tick = async () => {
    if (!inFlightTasks.has(entry.taskId)) return; // already removed elsewhere
    const elapsedMs = Date.now() - startedAtMs;
    if (elapsedMs > HARD_BRIDGE_TIMEOUT_MS) {
      log('WARN', `task ${entry.taskId} watcher giving up after ${Math.round(elapsedMs/60000)}min — task may still be running on the dashboard runner`);
      await tgSendDirect(ctx.token, {
        chatId: entry.chatId, threadId: entry.threadId,
        text: `Task ${entry.taskId.slice(0,8)} is still running after ${Math.round(elapsedMs/60000)} min — bridge stops watching but the dashboard runner continues. Use /claude status or /claude logs to check, /claude stop to abort.`
      });
      inFlightTasks.delete(entry.taskId);
      saveInflight();
      return;
    }

    let task = null;
    try {
      const r = await httpJson('GET', taskUrl, null, { timeoutMs: 8000 });
      if (r.statusCode === 200 && r.parsed) task = r.parsed;
    } catch (e) {
      log('WARN', `task ${entry.taskId} poll failed: ${e.message}`);
    }

    if (!task) { setTimeout(tick, PROGRESS_POLL_INTERVAL_MS); return; }

    // Terminal state — send final reply, remove from inflight.
    if (task.status && task.status !== 'running') {
      log('INFO', `task ${entry.taskId} terminal: ${task.status}`);
      const reply = formatFinalReply(task, entry.label);
      const r = await tgSendDirect(ctx.token, { chatId: entry.chatId, threadId: entry.threadId, text: reply });
      if (r.ok) log('INFO', `task ${entry.taskId} final sent (msg ${r.messageId})`);
      else log('ERR', `task ${entry.taskId} final send FAILED: ${r.error}`);
      inFlightTasks.delete(entry.taskId);
      saveInflight();
      return;
    }

    // Still running. Maybe send a progress note if we crossed a threshold.
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const nextThreshold = PROGRESS_THRESHOLDS_SEC[entry.progressLevel];
    if (nextThreshold != null && elapsedSec >= nextThreshold) {
      const stuckSec = task.staleMs != null ? Math.floor(task.staleMs / 1000) : null;
      const stuckTag = task.possiblyStuck ? ' (POSSIBLY STUCK — no output for ' + Math.round(stuckSec/60) + 'm)' : '';
      const progressText = `Task ${entry.taskId.slice(0,8)} still running — ${Math.round(elapsedSec/60)}m elapsed${stuckTag}.\n\nUse /claude logs for the latest output, /claude stop to abort.`;
      const r = await tgSendDirect(ctx.token, { chatId: entry.chatId, threadId: entry.threadId, text: progressText });
      if (r.ok) log('INFO', `task ${entry.taskId} progress note sent (level ${entry.progressLevel}, msg ${r.messageId})`);
      entry.progressLevel += 1;
      entry.lastProgressAt = new Date().toISOString();
      saveInflight();
    }

    setTimeout(tick, PROGRESS_POLL_INTERVAL_MS);
  };

  // Kick off — small initial delay so the user sees the ack first.
  setTimeout(tick, 500);
}

// On bridge startup, re-attach watchers to any tasks recorded as in-flight
// from a previous run. Tasks that already completed are short-circuited by
// the watcher's first poll (terminal status sends the final reply right
// away).
function recoverInflightWatchers(ctx) {
  const previous = loadInflight();
  if (!previous.length) return;
  log('INFO', `recovering ${previous.length} in-flight task watcher(s) from previous run`);
  for (const e of previous) {
    if (!e || !e.taskId) continue;
    inFlightTasks.set(e.taskId, e);
    startTaskWatcher(e, ctx);
  }
}

// ---------------------------------------------------------------- per-user rate limit
const lastDispatchByUser = new Map();
function rateLimited(userId, minIntervalMs) {
  if (!minIntervalMs) return false;
  const now = Date.now();
  const last = lastDispatchByUser.get(userId) || 0;
  if (now - last < minIntervalMs) return true;
  lastDispatchByUser.set(userId, now);
  return false;
}

// ---------------------------------------------------------------- update handler
async function handleUpdate(update, ctx) {
  const message = update.message || update.edited_message;
  if (!message) return;
  const fromUserId = message.from && message.from.id != null ? String(message.from.id) : null;
  if (!fromUserId) return;
  if (!message.text) return; // dev-bridge only accepts slash commands
  const chatId = message.chat && message.chat.id != null ? String(message.chat.id) : fromUserId;
  // Topic-aware reply: if the message arrived in a forum topic, send back
  // into the same topic so the conversation stays threaded. Falls back to
  // the configured static threadId only if the inbound message isn't in a
  // topic (e.g. DM or generic group).
  const replyThreadId = message.message_thread_id != null
    ? message.message_thread_id
    : ctx.cfg.threadId;

  const parsed = parseCommand(message.text, ctx.cfg.botUsername);

  // Dev-bridge scope: only slash commands are accepted. Free-text routing
  // moved to the CLAWY runtime (@Clawy_OpenClawBot) which owns the topics.
  // Plain messages here are silently ignored (don't even ack — keeps DMs
  // quiet and avoids accidental Claude task launches from chit-chat).
  if (!parsed) return;
  // ----- /commands ------------------------------------------------------

  if (!ctx.cfg.allowedUserIds.includes(fromUserId)) {
    log('WARN', `ignored /${parsed.command} from disallowed user ${fromUserId}`);
    return;
  }
  if (rateLimited(fromUserId, ctx.cfg.perUserRateLimitMs)) {
    log('INFO', `rate-limited /${parsed.command} from ${fromUserId}`);
    return;
  }

  // Local commands handled inside the bridge (never round-trip to the
  // dashboard's COMMANDS map). /start and /help are Telegram conventions —
  // the dashboard doesn't know them, so dispatching them returns a 400 and
  // the user gets an "unknown command" error instead of a friendly welcome.
  const localReply = LOCAL_COMMANDS[parsed.command];
  if (localReply) {
    log('INFO', `local /${parsed.command} from ${fromUserId} thread=${replyThreadId ?? '-'}`);
    const sendRes = await tgSendDirect(ctx.token, {
      chatId, threadId: replyThreadId, text: localReply
    });
    if (sendRes.ok) log('INFO', `local /${parsed.command} reply sent (msg ${sendRes.messageId})`);
    else log('ERR', `local /${parsed.command} reply FAILED: ${sendRes.error}`);
    return;
  }

  // Dev-bridge whitelist. Anything outside this list is owned by CLAWY
  // (@Clawy_OpenClawBot) — point users there instead of silently failing.
  // The dispatcher *does* know /news, /organizer, /traffic-law, /system-map,
  // /status: those are kept for the CLAWY runtime to call. Refusing them
  // here keeps responsibility split clean (and avoids two bots both
  // answering the same command).
  const BRIDGE_ALLOWED_COMMANDS = new Set(['claude', 'dashboard', 'topics']);
  if (!BRIDGE_ALLOWED_COMMANDS.has(parsed.command)) {
    log('INFO', `bridge-rejecting /${parsed.command} from ${fromUserId} (handled by @Clawy_OpenClawBot)`);
    await tgSendDirect(ctx.token, {
      chatId, threadId: replyThreadId,
      text: `/${parsed.command} is owned by @Clawy_OpenClawBot. Use it inside the matching topic of the OpenClaw supergroup. This bot only handles /claude, /dashboard, /topics.`
    });
    return;
  }

  log('INFO', `dispatch /${parsed.command} from ${fromUserId} thread=${replyThreadId ?? '-'} (${parsed.args.length} chars args)`);

  let dispatchResult;
  try {
    dispatchResult = await dispatchToDashboard(parsed, fromUserId, message.message_id);
  } catch (e) {
    log('ERR', `dispatch failed: ${e.message}`);
    await tgSendDirect(ctx.token, {
      chatId, threadId: replyThreadId,
      text: `Sorry, /${parsed.command} could not be dispatched: ${e.message.slice(0, 300)}`
    });
    return;
  }

  // Two response shapes from /api/telegram/dispatch:
  //   kind:'reply'  → synchronous, replyText is the answer; nothing to poll.
  //   kind:'claude' → asynchronous, taskId points at a runner job; the
  //                   bridge polls it and sends the trailing output when done.
  // If the dashboard is older / unrecognised, fall back to "treat as task".
  const kind = dispatchResult && dispatchResult.kind;

  if (kind === 'reply') {
    const text = (dispatchResult.replyText || '(no reply text)').slice(0, FINAL_OUTPUT_LIMIT);
    const r = await tgSendDirect(ctx.token, { chatId, threadId: replyThreadId, text });
    if (r.ok) log('INFO', `dispatch /${parsed.command} reply sent (msg ${r.messageId})`);
    else log('ERR', `dispatch /${parsed.command} reply FAILED: ${r.error}`);
    return;
  }

  const taskId = dispatchResult && dispatchResult.taskId;
  if (!taskId) {
    await tgSendDirect(ctx.token, {
      chatId, threadId: replyThreadId,
      text: `Dispatch ok but no taskId returned. Raw: ${JSON.stringify(dispatchResult).slice(0, 300)}`
    });
    return;
  }

  // For task-shaped responses ('claude' or any future async kind):
  //   1. Send the ack synchronously (sub-second).
  //   2. Hand the taskId off to a background watcher (trackTask).
  //   3. Return from handleUpdate IMMEDIATELY so the bridge keeps polling
  //      Telegram for the next message.
  // The watcher runs on its own setTimeout chain, sends progress updates at
  // 5/15/30/45/60 min if the task is still running, and the final reply when
  // the task hits a terminal state. State is persisted under
  // state/in-flight-tasks.json so a bridge restart doesn't orphan the user.
  const ackText = (dispatchResult.replyText || `Working on /${parsed.command} — task ${taskId}`)
    + (dispatchResult.dashboardUrl ? `\nLive: ${dispatchResult.dashboardUrl}` : '');
  const ackRes = await tgSendDirect(ctx.token, { chatId, threadId: replyThreadId, text: ackText });
  if (ackRes.ok) log('INFO', `task ${taskId} ack sent (msg ${ackRes.messageId}) — watcher armed (non-blocking)`);
  else log('ERR', `task ${taskId} ack send FAILED: ${ackRes.error}`);

  trackTask({ taskId, chatId, threadId: replyThreadId, label: parsed.command, ctx });
  // Return immediately — DO NOT await task completion. The whole point of
  // this rewrite is that handleUpdate finishes in ~1s no matter what.
}

// ---------------------------------------------------------------- main loop
async function selfCheck(ctx) {
  log('INFO', `self-check: dashboard=${DASHBOARD_URL}`);
  try {
    const r = await httpJson('GET', `${DASHBOARD_URL}/api/health`, null, { timeoutMs: 5000 });
    if (r.statusCode !== 200) throw new Error(`/api/health returned ${r.statusCode}`);
    log('INFO', `dashboard health OK (pid ${r.parsed && r.parsed.pid})`);
  } catch (e) {
    log('ERR', `dashboard unreachable: ${e.message}`);
    return 2;
  }
  try {
    const r = await httpJson('GET', `${DASHBOARD_URL}/api/telegram/commands`, null, { timeoutMs: 5000 });
    if (r.statusCode !== 200) throw new Error(`/api/telegram/commands returned ${r.statusCode}`);
    log('INFO', `dispatch endpoint OK; commands: ${(r.parsed.commands || []).map(c => c.name).join(', ')}`);
  } catch (e) {
    log('ERR', `dispatch endpoint missing: ${e.message}`);
    return 3;
  }
  if (!ctx.token) {
    log('WARN', `no bot token at ${TOKEN_FILE_PRIMARY} (or ${TOKEN_FILE_FALLBACK}, and OPENCLAW_BRIDGE_TOKEN unset). Bridge will not poll.`);
    return 4;
  }
  try {
    const me = await tg(ctx.token, 'getMe', {});
    log('INFO', `telegram getMe OK: @${me.username} (id ${me.id})`);
  } catch (e) {
    log('ERR', `telegram getMe failed: ${e.message}`);
    return 5;
  }
  if (!ctx.cfg.allowedUserIds.length) {
    log('WARN', `config.allowedUserIds is empty — every incoming message will be ignored. Edit ${CONFIG_FILE}.`);
  }
  log('INFO', 'self-check OK');
  return 0;
}

async function mainLoop(ctx) {
  let offset = readOffset();
  // Restore in-flight task watchers BEFORE entering the poll loop. If any of
  // these tasks already completed during the bridge's downtime, the watcher's
  // first poll will detect the terminal state and send the final reply
  // immediately. Either way, the user doesn't get orphaned by a restart.
  recoverInflightWatchers(ctx);
  log('INFO', `starting poll loop offset=${offset} timeout=${POLL_TIMEOUT}s in-flight=${inFlightTasks.size}`);
  let consecutiveErrors = 0;
  while (true) {
    try {
      const updates = await tg(ctx.token, 'getUpdates', {
        offset: offset > 0 ? offset + 1 : undefined,
        timeout: POLL_TIMEOUT,
        allowed_updates: ['message', 'edited_message']
      });
      consecutiveErrors = 0;
      for (const u of updates) {
        try {
          await handleUpdate(u, ctx);
        } catch (e) {
          log('ERR', `handleUpdate failed: ${e.stack || e.message}`);
        }
        if (u.update_id > offset) {
          offset = u.update_id;
          writeOffset(offset);
        }
      }
    } catch (e) {
      consecutiveErrors += 1;
      const backoff = Math.min(60000, 1000 * Math.pow(2, consecutiveErrors));
      log('ERR', `getUpdates failed (#${consecutiveErrors}): ${e.message}; backing off ${backoff}ms`);
      await sleep(backoff);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cfg = loadConfig();
  const token = loadToken();
  const ctx = { cfg, token };
  if (args.includes('--self-check')) {
    process.exit(await selfCheck(ctx));
  }
  if (!token) {
    log('ERR', `no bot token. Place token at ${TOKEN_FILE_PRIMARY} (or ${TOKEN_FILE_FALLBACK}) or set OPENCLAW_BRIDGE_TOKEN; see README.md.`);
    process.exit(2);
  }
  if (!cfg.allowedUserIds.length) {
    log('ERR', `${CONFIG_FILE} has no allowedUserIds — refusing to start (would silently ignore all messages).`);
    process.exit(3);
  }
  await mainLoop(ctx);
}

main().catch((e) => {
  log('ERR', `fatal: ${e.stack || e.message}`);
  process.exit(1);
});

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
const TOKEN_FILE = path.join(os.homedir(), '.openclaw', 'traffic-bridge.token');
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
  if (process.env.TRAFFIC_BRIDGE_TOKEN) {
    const t = process.env.TRAFFIC_BRIDGE_TOKEN.trim();
    if (t) return t;
  }
  if (!fs.existsSync(TOKEN_FILE)) {
    return null;
  }
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').replace(/^﻿/, '').trim();
  } catch (e) {
    log('ERR', `cannot read ${TOKEN_FILE}: ${e.message}`);
    return null;
  }
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

async function pollTaskCompletion(taskId, { timeoutMs = 25 * 60 * 1000, intervalMs = 4000 } = {}) {
  const url = `${DASHBOARD_URL}/api/claude/task/${taskId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let r;
    try { r = await httpJson('GET', url, null, { timeoutMs: 8000 }); }
    catch (e) {
      log('WARN', `task poll failed: ${e.message}`);
      await sleep(intervalMs);
      continue;
    }
    if (r.statusCode !== 200 || !r.parsed) {
      await sleep(intervalMs);
      continue;
    }
    const t = r.parsed;
    if (t.status && t.status !== 'running') return t;
    await sleep(intervalMs);
  }
  return null; // timed out
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  if (!message.text) return;
  const fromUserId = message.from && message.from.id != null ? String(message.from.id) : null;
  if (!fromUserId) return;
  const chatId = message.chat && message.chat.id != null ? String(message.chat.id) : fromUserId;

  const parsed = parseCommand(message.text, ctx.cfg.botUsername);
  if (!parsed) return; // not a slash-command
  if (!ctx.cfg.allowedUserIds.includes(fromUserId)) {
    log('WARN', `ignored /${parsed.command} from disallowed user ${fromUserId}`);
    return;
  }
  if (rateLimited(fromUserId, ctx.cfg.perUserRateLimitMs)) {
    log('INFO', `rate-limited /${parsed.command} from ${fromUserId}`);
    return;
  }

  log('INFO', `dispatch /${parsed.command} from ${fromUserId} (${parsed.args.length} chars args)`);

  let dispatchResult;
  try {
    dispatchResult = await dispatchToDashboard(parsed, fromUserId, message.message_id);
  } catch (e) {
    log('ERR', `dispatch failed: ${e.message}`);
    await sendViaGateway({
      targetUserId: chatId,
      threadId: ctx.cfg.threadId,
      text: `Sorry, /${parsed.command} could not be dispatched: ${e.message.slice(0, 300)}`,
      sessionKey: ctx.cfg.sessionKey,
      accountId: ctx.cfg.accountId
    });
    return;
  }

  const taskId = dispatchResult && dispatchResult.taskId;
  if (!taskId) {
    await sendViaGateway({
      targetUserId: chatId,
      threadId: ctx.cfg.threadId,
      text: `Dispatch ok but no taskId returned. Raw: ${JSON.stringify(dispatchResult).slice(0, 300)}`,
      sessionKey: ctx.cfg.sessionKey,
      accountId: ctx.cfg.accountId
    });
    return;
  }

  await sendViaGateway({
    targetUserId: chatId,
    threadId: ctx.cfg.threadId,
    text: `Working on /${parsed.command} — task ${taskId}\nLive view: ${dispatchResult.dashboardUrl || (DASHBOARD_URL + '/?taskId=' + taskId)}`,
    sessionKey: ctx.cfg.sessionKey,
    accountId: ctx.cfg.accountId
  });

  const finalTask = await pollTaskCompletion(taskId);
  if (!finalTask) {
    await sendViaGateway({
      targetUserId: chatId,
      threadId: ctx.cfg.threadId,
      text: `Task ${taskId} is still running after the bridge's poll timeout. Open the dashboard to follow live: ${DASHBOARD_URL}`,
      sessionKey: ctx.cfg.sessionKey,
      accountId: ctx.cfg.accountId
    });
    return;
  }

  const stdoutTail = (finalTask.stdout || '').slice(-FINAL_OUTPUT_LIMIT);
  const summary = finalTask.status === 'completed'
    ? `Task ${taskId} completed.\n\n${stdoutTail || '(no stdout)'}`
    : `Task ${taskId} ended with status=${finalTask.status} exit=${finalTask.exitCode}.\n\n${stdoutTail || finalTask.stderr || '(no output)'}`;

  await sendViaGateway({
    targetUserId: chatId,
    threadId: ctx.cfg.threadId,
    text: summary,
    sessionKey: ctx.cfg.sessionKey,
    accountId: ctx.cfg.accountId
  });
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
    log('WARN', `no bot token at ${TOKEN_FILE} (and TRAFFIC_BRIDGE_TOKEN unset). Bridge will not poll.`);
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
  log('INFO', `starting poll loop offset=${offset} timeout=${POLL_TIMEOUT}s`);
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
    log('ERR', `no bot token. Place token at ${TOKEN_FILE} or set TRAFFIC_BRIDGE_TOKEN; see README.md.`);
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

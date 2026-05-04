#!/usr/bin/env node
// Sends a Telegram message through the local OpenClaw gateway by shelling out
// to `openclaw gateway call send`.
//
// Usage:
//   node send-via-gateway.js \
//       --channel telegram \
//       --to telegram:620906995 \
//       --account default \
//       [--threadId 106] \
//       --session-key agent:main:telegram:direct:620906965 \
//       --text-file path/to/text.txt \
//       [--idempotency-key <uuid>]
//
// The token is read from ~/.openclaw/gateway.token and passed via
// OPENCLAW_GATEWAY_TOKEN env so it never appears in argv.
//
// Output (stdout, JSON): { ok, gatewayResult? , error? }

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

const OPENCLAW_CLI = 'C:\\Users\\Itzhak\\AppData\\Roaming\\npm\\openclaw.cmd';
const TOKEN_PATH = path.join(os.homedir(), '.openclaw', 'gateway.token');

function fail(msg, extra) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg, ...(extra || {}) }, null, 2) + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) { out[k] = v; i++; }
      else out[k] = true;
    }
  }
  return out;
}

function readToken() {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^﻿/, '').trim();
  } catch (e) {
    fail(`cannot read gateway token at ${TOKEN_PATH}: ${e.message}`);
  }
}

function callGateway(method, params, opts = {}) {
  const token = readToken();
  const env = { ...process.env, OPENCLAW_GATEWAY_TOKEN: token };
  // .cmd shims need cmd.exe /c on Windows; spawnSync direct returns EINVAL.
  const inner = [
    'gateway', 'call', method,
    '--params', JSON.stringify(params || {}),
    '--json',
    '--timeout', String(opts.timeoutMs || 25000)
  ];
  const r = spawnSync('cmd.exe', ['/c', OPENCLAW_CLI, ...inner], { encoding: 'utf8', env, windowsHide: true });
  if (r.status !== 0) {
    return { ok: false, exit: r.status, stderr: (r.stderr || '').slice(0, 800), stdout: (r.stdout || '').slice(0, 800) };
  }
  let parsed = null;
  try {
    // openclaw CLI may emit a banner line before the JSON when --json is set; find first {
    const match = r.stdout.match(/\{[\s\S]*\}\s*$/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {}
  return { ok: true, parsed, raw: r.stdout };
}

const args = parseArgs(process.argv.slice(2));

if (args['self-test']) {
  const h = callGateway('health', {}, { timeoutMs: 10000 });
  process.stdout.write(JSON.stringify({ ok: h.ok, parsed: h.parsed ? 'present' : 'absent' }, null, 2));
  process.exit(h.ok ? 0 : 2);
}

if (!args.channel)        fail('--channel required');
if (!args.to)             fail('--to required');
if (!args['text-file'])   fail('--text-file required');
if (!args['session-key']) fail('--session-key required');

let text;
try { text = fs.readFileSync(args['text-file'], 'utf8').replace(/^﻿/, ''); }
catch (e) { fail(`cannot read text file ${args['text-file']}: ${e.message}`); }

text = text.trim();
if (!text) fail('text file is empty');

const idempotencyKey = args['idempotency-key'] || randomUUID();

const params = {
  to: args.to,
  channel: args.channel,
  accountId: args.account || 'default',
  threadId: args.threadId || undefined,
  message: text,
  sessionKey: args['session-key'],
  idempotencyKey
};

const r = callGateway('send', params, { timeoutMs: 30000 });
if (!r.ok) {
  fail('gateway call failed', { detail: { exit: r.exit, stderr: r.stderr } });
}
process.stdout.write(JSON.stringify({
  ok: true,
  gatewayResult: r.parsed,
  idempotencyKey,
  textBytes: Buffer.byteLength(text, 'utf8')
}, null, 2) + '\n');

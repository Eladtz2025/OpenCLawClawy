#!/usr/bin/env node
// One-shot smoke test for the Telegram dispatch endpoint.
//
// Verifies:
//   1. /api/health responds.
//   2. /api/telegram/commands lists `traffic`.
//   3. /api/telegram/dispatch with command=traffic returns a taskId
//      and the new task appears in /api/claude/task/<id>.
//
// Does NOT touch Telegram. Stops the spawned task immediately so it
// doesn't burn through Claude time.

'use strict';

const http = require('http');
const { URL } = require('url');

const DASHBOARD = process.env.OPENCLAW_DASHBOARD_URL || 'http://127.0.0.1:7777';

function httpJson(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + (u.search || ''),
      headers: { 'content-type': 'application/json' }
    };
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    if (data) opts.headers['content-length'] = data.length;
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch {}
        resolve({ statusCode: res.statusCode, text, parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
}

function fail(step, detail) {
  console.error(`FAIL: ${step}`);
  if (detail) console.error(detail);
  process.exit(1);
}

(async () => {
  console.log(`smoke-test against ${DASHBOARD}`);

  const health = await httpJson('GET', `${DASHBOARD}/api/health`);
  if (health.statusCode !== 200) fail('/api/health', `status ${health.statusCode}`);
  console.log(`  health OK (pid ${health.parsed && health.parsed.pid})`);

  const cmds = await httpJson('GET', `${DASHBOARD}/api/telegram/commands`);
  if (cmds.statusCode !== 200) fail('/api/telegram/commands', `status ${cmds.statusCode}`);
  const names = (cmds.parsed && cmds.parsed.commands || []).map(c => c.name);
  if (!names.includes('traffic')) fail('command list', `expected traffic; got ${names.join(',')}`);
  console.log(`  commands OK: [${names.join(', ')}]`);

  const dispatch = await httpJson('POST', `${DASHBOARD}/api/telegram/dispatch`, {
    command: 'traffic',
    args: 'smoke test — please ignore',
    fromUserId: 'smoke-test'
  });
  if (dispatch.statusCode !== 200) fail('/api/telegram/dispatch', `status ${dispatch.statusCode} body ${dispatch.text.slice(0, 200)}`);
  const taskId = dispatch.parsed && dispatch.parsed.taskId;
  if (!taskId) fail('dispatch', `no taskId in response: ${dispatch.text}`);
  console.log(`  dispatch OK -> taskId=${taskId}`);

  const task = await httpJson('GET', `${DASHBOARD}/api/claude/task/${taskId}`);
  if (task.statusCode !== 200) fail('task lookup', `status ${task.statusCode}`);
  const t = task.parsed;
  console.log(`  task visible: status=${t.status} mode=${t.mode}`);

  const stop = await httpJson('POST', `${DASHBOARD}/api/claude/task/${taskId}/stop`, {});
  console.log(`  stop sent: status=${stop.statusCode}`);

  console.log('PASS');
})().catch((e) => {
  fail('exception', e.stack || e.message);
});

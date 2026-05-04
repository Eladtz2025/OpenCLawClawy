#!/usr/bin/env node
// cron-guard: read-only health check of ~/.openclaw/cron/jobs.json.
// Reports OK / WARN / LOOP / DISABLED per job. Never modifies anything.
// Exit codes: 0 = clean, 2 = at least one LOOP detected.

const fs = require('fs');
const path = require('path');
const os = require('os');

const JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
const LOOP_THRESHOLD = 3;
const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

function trunc(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function classify(job) {
  const state = job.state || {};
  const errs = Number(state.consecutiveErrors || 0);
  if (!job.enabled) return 'DISABLED';
  if (errs >= LOOP_THRESHOLD) return 'LOOP';
  if (errs >= 1) return 'WARN';
  return 'OK';
}

function describeSchedule(s) {
  if (!s) return '?';
  if (s.kind === 'cron') return `cron \"${s.expr}\" tz=${s.tz || 'local'}`;
  if (s.kind === 'every') return `every ${Math.round((s.everyMs || 0) / 1000)}s`;
  return s.kind || '?';
}

let raw;
try {
  raw = fs.readFileSync(JOBS_PATH, 'utf8');
} catch (e) {
  const msg = `cron-guard: cannot read ${JOBS_PATH}: ${e.message}`;
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg }));
  else console.error(msg);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  const msg = `cron-guard: invalid JSON in ${JOBS_PATH}: ${e.message}`;
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg }));
  else console.error(msg);
  process.exit(1);
}

const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
const report = jobs.map(j => ({
  id: j.id,
  name: j.name,
  enabled: !!j.enabled,
  schedule: describeSchedule(j.schedule),
  status: classify(j),
  consecutiveErrors: Number((j.state || {}).consecutiveErrors || 0),
  lastStatus: (j.state || {}).lastStatus || null,
  lastRunStatus: (j.state || {}).lastRunStatus || null,
  lastError: trunc((j.state || {}).lastError || '', 160)
}));

const loops = report.filter(r => r.status === 'LOOP');
const warns = report.filter(r => r.status === 'WARN');

if (asJson) {
  console.log(JSON.stringify({
    ok: loops.length === 0,
    threshold: LOOP_THRESHOLD,
    summary: {
      total: report.length,
      loop: loops.length,
      warn: warns.length,
      disabled: report.filter(r => r.status === 'DISABLED').length,
      ok: report.filter(r => r.status === 'OK').length
    },
    jobs: report
  }, null, 2));
} else {
  console.log(`cron-guard report (loop threshold = ${LOOP_THRESHOLD} consecutive errors)\n`);
  for (const r of report) {
    const tag = r.status.padEnd(8);
    console.log(`[${tag}] ${r.name}`);
    console.log(`           id: ${r.id}`);
    console.log(`           schedule: ${r.schedule}`);
    console.log(`           enabled: ${r.enabled}, consecutiveErrors: ${r.consecutiveErrors}, lastRunStatus: ${r.lastRunStatus}`);
    if (r.lastError) console.log(`           lastError: ${r.lastError}`);
    console.log('');
  }
  if (loops.length) {
    console.log('PROPOSED FIX:');
    for (const r of loops) {
      console.log(`  - Disable job "${r.name}" (id ${r.id}) by setting enabled: false in ${JOBS_PATH}.`);
      console.log(`    Then log to ~/.openclaw/CHANGELOG.md per the changelog skill.`);
    }
  } else if (warns.length) {
    console.log(`OK: no looping jobs (${warns.length} job(s) in WARN — keep an eye on them).`);
  } else {
    console.log('OK: no looping or warning jobs.');
  }
}

process.exit(loops.length ? 2 : 0);

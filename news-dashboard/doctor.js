#!/usr/bin/env node
// news-dashboard-doctor: read-only health check for the daily news dashboard.
// Usage: node doctor.js [--json]

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const WORKSPACE = path.resolve(ROOT, '..');
const STATE_PATH = path.join(ROOT, 'state.json');
const SUMMARY_PATH = path.join(ROOT, 'daily-summary.json');
const ALERT_PATH = path.join(ROOT, 'telegram-alert.txt');
const TELEGRAM_SUMMARY_PATH = path.join(ROOT, 'telegram-summary.txt');
const CRON_JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
const NEWS_CRON_NAME = 'daily-news-dashboard-0730-israel-private';
const TASK_STATUS_PATH = path.join(WORKSPACE, 'control-dashboard', 'state', 'news-scheduled-task.json');

const KNOWN_BAD_SOURCES = new Set([
  'Reuters Tech',
  'Kan News',
  'The Block',
  'SEC Press Releases',
  'Blockworks',
  'Walla Sport',
  'Soccerway Hapoel PT',
  'ONE Sport',
  'Sport 5'
]);

// 26h = the daily cron should have fired by now (it runs every 24h at 07:30 IL).
// 30h is too generous and missed today's "morning never delivered" case.
const STALE_AFTER_HOURS = 26;
const asJson = process.argv.includes('--json');

function stripBom(s) { return (s && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s; }
function readJson(p) { return JSON.parse(stripBom(fs.readFileSync(p, 'utf8'))); }

function safeReadText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function readWindowsTaskState() {
  try {
    const t = JSON.parse(stripBom(fs.readFileSync(TASK_STATUS_PATH, 'utf8')));
    return {
      found: true,
      schedulerType: 'windows-task',
      enabled: true,
      lastRunAt: t.lastRunEndedAt || t.lastRunStartedAt || null,
      nextRunAt: t.nextRunAt || null,
      lastStatus: t.lastStatus || null,
      lastRunStatus: t.lastStatus === 'ok' ? 'ok' : (t.lastStatus === 'error' ? 'error' : null),
      lastDeliveryStatus: t.lastDeliveryStatus || null,
      lastDelivered: t.lastDelivered === true,
      consecutiveErrors: Number(t.consecutiveErrors || 0),
      lastError: (t.lastError || '').slice(0, 240),
      taskName: t.taskName || 'OpenClaw-NewsDashboard-Morning'
    };
  } catch {
    return null;
  }
}

function readDockerCronState() {
  try {
    const j = JSON.parse(stripBom(fs.readFileSync(CRON_JOBS_PATH, 'utf8')));
    const job = (j.jobs || []).find(x => x.name === NEWS_CRON_NAME);
    if (!job) return { found: false };
    const s = job.state || {};
    return {
      found: true,
      schedulerType: 'docker-cron',
      enabled: !!job.enabled,
      lastRunAtMs: s.lastRunAtMs || null,
      lastRunAt: s.lastRunAtMs ? new Date(s.lastRunAtMs).toISOString() : null,
      nextRunAtMs: s.nextRunAtMs || null,
      nextRunAt: s.nextRunAtMs ? new Date(s.nextRunAtMs).toISOString() : null,
      lastStatus: s.lastStatus || null,
      lastRunStatus: s.lastRunStatus || null,
      lastDeliveryStatus: s.lastDeliveryStatus || null,
      lastDelivered: s.lastDelivered === true,
      consecutiveErrors: Number(s.consecutiveErrors || 0),
      lastError: (s.lastError || '').slice(0, 240)
    };
  } catch (e) {
    return { found: false, readError: e.message };
  }
}

// Canonical scheduler state: prefer the Windows task (Node-native, no Docker).
// Fall back to the legacy Docker cron only if the Windows task hasn't been
// installed yet — in that case its problems are surfaced as before.
function readCronState() {
  const win = readWindowsTaskState();
  if (win) return win;
  return readDockerCronState();
}

function curlHead(url) {
  const out = execFileSync('curl.exe', [
    '-L', '--silent', '--show-error', '--max-time', '15',
    '-o', 'NUL', '-w', '%{http_code}', url
  ], { encoding: 'utf8' });
  return Number(String(out).trim());
}

function curlBody(url, max = 524288) {
  return execFileSync('curl.exe', [
    '-L', '--silent', '--show-error', '--fail', '--max-time', '20', url
  ], { encoding: 'utf8', maxBuffer: max * 4 });
}

function emit(level, msg) {
  if (!asJson) console.log(`[${level.padEnd(4)}] ${msg}`);
}

function summarize() {
  const issues = [];
  const result = {
    ok: true,
    checkedAt: new Date().toISOString(),
    state: null,
    summary: null,
    liveUrl: null,
    alert: null,
    cron: null,
    perTopic: [],
    newFailures: [],
    issues
  };

  // ---- 0. scheduler state (catches "morning delivery never fired") ----
  // Prefers Windows Task Scheduler ("OpenClaw-NewsDashboard-Morning"); falls
  // back to the legacy Docker-based OpenClaw cron when the new task is not
  // installed yet.
  const cron = readCronState();
  result.cron = cron;
  const schedulerLabel = cron.schedulerType === 'windows-task'
    ? `Windows task "${cron.taskName}"`
    : `cron "${NEWS_CRON_NAME}"`;
  if (!cron.found) {
    issues.push(`no scheduler found — neither Windows task status file nor Docker cron job is present`);
    result.ok = false;
    emit('WARN', 'no scheduler found (Windows task not installed; Docker cron also missing)');
  } else {
    if (!cron.enabled) {
      issues.push(`${schedulerLabel} is DISABLED — no morning delivery will happen`);
      result.ok = false;
      emit('WARN', `${schedulerLabel} disabled — no morning delivery`);
    }
    if (cron.lastStatus === 'error' || cron.lastRunStatus === 'error') {
      issues.push(`${schedulerLabel} lastRun ERROR: ${cron.lastError || 'no message'}`);
      result.ok = false;
      emit('WARN', `${schedulerLabel} lastRun ERROR: ${(cron.lastError || '').slice(0, 160)}`);
    } else {
      emit('OK', `${schedulerLabel} lastStatus=${cron.lastStatus}, consecutiveErrors=${cron.consecutiveErrors}`);
    }
    if (cron.consecutiveErrors >= 1) {
      issues.push(`${schedulerLabel} consecutiveErrors=${cron.consecutiveErrors} (any non-zero = today/recent failed)`);
      result.ok = false;
    }
  }

  // ---- 1. read state ----
  let state;
  try {
    state = readJson(STATE_PATH);
  } catch (e) {
    issues.push(`cannot read state.json: ${e.message}`);
    result.ok = false;
    return result;
  }
  result.state = {
    buildId: state.buildId || null,
    lastPublishedAt: state.lastPublishedAt || null,
    publicLatestUrl: state.publicLatestUrl || null,
    publicUrl: state.publicUrl || null,
    sourcesWorkedCount: state.sourcesWorkedCount || 0,
    fallbackActive: !!state.fallbackActive,
    status: state.status || null
  };
  emit('OK', `state.buildId = ${state.buildId}`);

  // ---- 2. freshness ----
  if (state.lastPublishedAt) {
    const ageH = (Date.now() - new Date(state.lastPublishedAt).getTime()) / 3600e3;
    result.freshness = { hoursSinceLastPublish: Number(ageH.toFixed(2)) };
    if (ageH > STALE_AFTER_HOURS) {
      issues.push(`last publish was ${ageH.toFixed(1)}h ago (>${STALE_AFTER_HOURS}h threshold)`);
      result.ok = false;
      emit('WARN', `last publish ${ageH.toFixed(1)}h ago — stale`);
    } else {
      emit('OK', `last publish ${ageH.toFixed(1)}h ago`);
    }
  }

  // ---- 3. daily summary ----
  let summary;
  try {
    summary = readJson(SUMMARY_PATH);
  } catch (e) {
    issues.push(`cannot read daily-summary.json: ${e.message}`);
    result.ok = false;
    return result;
  }
  result.summary = { status: summary.status, sourcesWorkedCount: summary.sourcesWorkedCount };
  if (summary.status !== 'SUCCESS') {
    issues.push(`daily-summary.status = ${summary.status}`);
    result.ok = false;
    emit('WARN', `daily-summary.status = ${summary.status}`);
  } else {
    emit('OK', `daily-summary.status = SUCCESS (sourcesWorked=${summary.sourcesWorkedCount})`);
  }

  // ---- 4. per-topic ----
  for (const t of (summary.topicStatus || [])) {
    const failedNames = (t.sourcesFailed || []).map(f => f.source);
    const newFailedNames = failedNames.filter(n => !KNOWN_BAD_SOURCES.has(n));
    result.perTopic.push({
      topic: t.topic,
      got: t.got,
      minGoodCount: t.minGoodCount,
      worked: t.sourcesWorked || [],
      failed: failedNames,
      newFailed: newFailedNames
    });
    if (newFailedNames.length) {
      result.newFailures.push({ topic: t.topic, sources: newFailedNames });
      emit('WARN', `topic "${t.topic}" has NEW failed source(s): ${newFailedNames.join(', ')}`);
    }
    if (t.got < t.minGoodCount) {
      issues.push(`topic "${t.topic}" got=${t.got} below min=${t.minGoodCount}`);
      result.ok = false;
      emit('WARN', `topic "${t.topic}" under target (got=${t.got}, min=${t.minGoodCount})`);
    }
  }

  // ---- 5. live URL ----
  if (state.publicLatestUrl) {
    try {
      const code = curlHead(state.publicLatestUrl);
      result.liveUrl = { url: state.publicLatestUrl, httpCode: code };
      if (code !== 200) {
        issues.push(`live URL HTTP ${code}: ${state.publicLatestUrl}`);
        result.ok = false;
        emit('WARN', `live URL HTTP ${code}`);
      } else {
        emit('OK', `live URL HTTP 200 (${state.publicLatestUrl})`);
      }
      if (code === 200 && state.buildId) {
        try {
          const body = curlBody(state.publicLatestUrl);
          const buildIdInBody = body.includes(state.buildId);
          result.liveUrl.buildIdMatch = buildIdInBody;
          if (!buildIdInBody) {
            issues.push(`live URL reachable but buildId ${state.buildId} not in body — Pages may be lagging`);
            result.ok = false;
            emit('WARN', `live URL serving an older build`);
          } else {
            emit('OK', `live URL serving current buildId ${state.buildId}`);
          }
        } catch (e) {
          issues.push(`live URL body fetch failed: ${e.message}`);
          emit('WARN', `live URL body fetch failed: ${e.message}`);
        }
      }
    } catch (e) {
      issues.push(`live URL unreachable: ${e.message}`);
      result.ok = false;
      result.liveUrl = { url: state.publicLatestUrl, error: String(e.message || e) };
      emit('WARN', `live URL unreachable: ${e.message}`);
    }
  }

  // ---- 6. pending alert ----
  const alertText = safeReadText(ALERT_PATH).trim();
  result.alert = alertText || null;
  if (alertText) {
    issues.push(`pending Telegram alert: ${alertText.slice(0, 200)}`);
    result.ok = false;
    emit('WARN', `pending alert: ${alertText.slice(0, 160)}`);
  } else {
    emit('OK', 'no pending Telegram alert');
  }

  return result;
}

const result = summarize();
if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('');
  console.log(result.ok ? 'DOCTOR: HEALTHY ✓' : 'DOCTOR: ATTENTION REQUIRED');
  if (!result.ok) {
    console.log('Issues:');
    for (const i of result.issues) console.log(`  - ${i}`);
  }
}
process.exit(result.ok ? 0 : 2);

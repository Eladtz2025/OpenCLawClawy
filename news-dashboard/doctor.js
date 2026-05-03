#!/usr/bin/env node
// news-dashboard-doctor: read-only health check for the daily news dashboard.
// Usage: node doctor.js [--json]

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const STATE_PATH = path.join(ROOT, 'state.json');
const SUMMARY_PATH = path.join(ROOT, 'daily-summary.json');
const ALERT_PATH = path.join(ROOT, 'telegram-alert.txt');
const TELEGRAM_SUMMARY_PATH = path.join(ROOT, 'telegram-summary.txt');
const CRON_JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
const NEWS_CRON_NAME = 'daily-news-dashboard-0730-israel-private';

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

const STALE_AFTER_HOURS = 30;
const asJson = process.argv.includes('--json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function safeReadText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
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
    perTopic: [],
    newFailures: [],
    issues
  };

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

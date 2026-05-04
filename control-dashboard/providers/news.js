// Status provider for the News Dashboard system.
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { readJsonOpt, readTextOpt, resolveWorkspacePath, runProcess, DASHBOARD_ROOT } = require('../lib/runtime');

const SEND_HELPER = path.join(DASHBOARD_ROOT, 'bin', 'send-via-gateway.js');
const LAST_SENT_PATH = path.join(DASHBOARD_ROOT, 'state', 'news-last-sent.json');
const TASK_STATUS_PATH = path.join(DASHBOARD_ROOT, 'state', 'news-scheduled-task.json');
const LAST_DOCTOR_PATH = path.join(DASHBOARD_ROOT, 'state', 'news-last-doctor.json');

const CRON_JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
const CRON_NAME = 'daily-news-dashboard-0730-israel-private';

function readDockerCron() {
  const j = readJsonOpt(CRON_JOBS_PATH);
  if (!j) return { found: false };
  const job = (j.jobs || []).find(x => x.name === CRON_NAME);
  if (!job) return { found: false };
  const s = job.state || {};
  return {
    found: true,
    enabled: !!job.enabled,
    schedule: job.schedule,
    lastRunAt: s.lastRunAtMs ? new Date(s.lastRunAtMs).toISOString() : null,
    nextRunAt: s.nextRunAtMs ? new Date(s.nextRunAtMs).toISOString() : null,
    lastStatus: s.lastStatus || null,
    lastRunStatus: s.lastRunStatus || null,
    lastDeliveryStatus: s.lastDeliveryStatus || null,
    lastDelivered: s.lastDelivered === true,
    consecutiveErrors: Number(s.consecutiveErrors || 0),
    lastError: (s.lastError || '').slice(0, 240)
  };
}

function readWindowsTaskStatus() {
  const t = readJsonOpt(TASK_STATUS_PATH);
  if (!t) return { found: false };
  return {
    found: true,
    enabled: true,
    schedule: t.schedule || { cronExpr: '30 7 * * *', tz: 'machine local' },
    lastRunAt: t.lastRunEndedAt || t.lastRunStartedAt || null,
    nextRunAt: t.nextRunAt || null,
    lastStatus: t.lastStatus || null,
    lastRunStatus: t.lastStatus === 'ok' ? 'ok' : (t.lastStatus === 'error' ? 'error' : null),
    lastDeliveryStatus: t.lastDeliveryStatus || null,
    lastDelivered: t.lastDelivered === true,
    consecutiveErrors: Number(t.consecutiveErrors || 0),
    lastError: (t.lastError || '').slice(0, 240),
    lastBuildId: t.lastBuildId || null,
    lastSendMessageId: t.lastSendMessageId || null,
    taskName: t.taskName || 'OpenClaw-NewsDashboard-Morning'
  };
}

// Compose the canonical "scheduler" status used by the dashboard. The
// Windows-native scheduled task is preferred when present; the legacy
// Docker-based OpenClaw cron job is shown as a (usually disabled) fallback.
function readScheduler() {
  const winTask = readWindowsTaskStatus();
  const dockerCron = readDockerCron();
  if (winTask.found) {
    return {
      ...winTask,
      schedulerType: 'windows-task',
      legacyDockerCron: dockerCron.found ? {
        enabled: dockerCron.enabled,
        lastStatus: dockerCron.lastStatus,
        consecutiveErrors: dockerCron.consecutiveErrors,
        lastError: dockerCron.lastError
      } : null
    };
  }
  // Pre-migration fallback: only the Docker cron is known.
  return { ...dockerCron, schedulerType: dockerCron.found ? 'docker-cron' : 'none' };
}

async function status(system) {
  const F = system.files;
  const state = readJsonOpt(resolveWorkspacePath(F.state)) || {};
  const summary = readJsonOpt(resolveWorkspacePath(F.summaryJson)) || {};
  const telegramSummary = (readTextOpt(resolveWorkspacePath(F.telegramSummary), 4000) || '').trim();
  const telegramAlert = (readTextOpt(resolveWorkspacePath(F.telegramAlert), 4000) || '').trim();
  const scheduler = readScheduler();
  const lastDoctor = readJsonOpt(LAST_DOCTOR_PATH);

  // Bucket "active" vs "historical/fallback" so old Docker-cron failures
  // can stay visible as history without keeping the page in ATTENTION
  // once the Windows scheduled task is the primary scheduler.
  const activeIssues = [];
  const historicalIssues = [];

  if (!scheduler.found) {
    activeIssues.push('no scheduler found (Windows task not yet installed; legacy Docker cron also missing)');
  } else if (scheduler.schedulerType === 'windows-task') {
    if (scheduler.lastStatus === 'error') activeIssues.push(`scheduled task last run errored: ${(scheduler.lastError || '').slice(0, 160)}`);
    if (scheduler.consecutiveErrors > 0) activeIssues.push(`scheduled task consecutiveErrors=${scheduler.consecutiveErrors}`);
    // Legacy Docker cron is deprecated when the Windows task is primary —
    // surface its residual errors as historical (informational), not active.
    const lc = scheduler.legacyDockerCron;
    if (lc && (lc.lastStatus === 'error' || lc.consecutiveErrors > 0)) {
      historicalIssues.push({
        category: 'fallback',
        text: `legacy Docker cron "${CRON_NAME}" — lastStatus=${lc.lastStatus || '—'}, consecutiveErrors=${lc.consecutiveErrors || 0} (deprecated; superseded by Windows scheduled task)`,
        detail: (lc.lastError || '').slice(0, 240)
      });
    }
  } else if (scheduler.schedulerType === 'docker-cron') {
    // Pre-migration: Docker cron *is* the active scheduler, so its problems are active.
    if (!scheduler.enabled) activeIssues.push(`cron "${CRON_NAME}" is DISABLED`);
    if (scheduler.lastStatus === 'error') activeIssues.push(`cron last run errored: ${(scheduler.lastError || '').slice(0, 160)}`);
    if (scheduler.consecutiveErrors > 0) activeIssues.push(`cron consecutiveErrors=${scheduler.consecutiveErrors}`);
  }
  if (telegramAlert) activeIssues.push(`pending telegram-alert: ${telegramAlert.slice(0, 160)}`);
  if (state.status && state.status !== 'SUCCESS') activeIssues.push(`pipeline status = ${state.status}`);

  let hoursSincePublish = null;
  if (state.lastPublishedAt) {
    hoursSincePublish = Number(((Date.now() - new Date(state.lastPublishedAt).getTime()) / 3600e3).toFixed(2));
    if (hoursSincePublish > 26) activeIssues.push(`last publish ${hoursSincePublish}h ago (>26h)`);
  }

  // Headline is driven exclusively by *active* issues. Historical/fallback
  // entries do not raise the page to ATTENTION.
  const headline = activeIssues.length === 0 ? 'OK' : 'ATTENTION';

  return {
    ok: activeIssues.length === 0,
    headline,
    summary: state.status ? `Pipeline ${state.status}, ${summary.sourcesWorkedCount ?? '?'} sources` : 'no state',
    lastRun: scheduler.lastRunAt,
    nextRun: scheduler.nextRunAt,
    lastBuildId: state.buildId || null,
    publicLatestUrl: state.publicLatestUrl || null,
    publicUrl: state.publicUrl || null,
    hoursSincePublish,
    // `cron` key kept for backwards-compat with the existing news card UI; it
    // now reflects whichever scheduler is canonical (Windows task preferred).
    cron: scheduler,
    scheduler,
    perTopicStatus: (summary.topicStatus || []).map(t => ({
      topic: t.topic, got: t.got, min: t.minGoodCount, sourcesFailedCount: (t.sourcesFailed || []).length
    })),
    telegram: {
      preparedSummary: telegramSummary || null,
      pendingAlert: telegramAlert || null,
      groupChatId: system.telegram.groupChatId,
      topicId: system.telegram.topicId,
      deliveryDmId: system.telegram.deliveryDmId
    },
    files: {
      runbook:  resolveWorkspacePath(F.runbook),
      doctor:   resolveWorkspacePath(F.doctorScript),
      summaryJson: resolveWorkspacePath(F.summaryJson),
      state:    resolveWorkspacePath(F.state),
      telegramSummary: resolveWorkspacePath(F.telegramSummary),
      telegramAlert:   resolveWorkspacePath(F.telegramAlert),
      scheduledRun: resolveWorkspacePath(F.scheduledRun),
      scheduledTaskRegistrar: resolveWorkspacePath(F.scheduledTaskRegistrar),
      scheduledTaskStatus: resolveWorkspacePath(F.scheduledTaskStatus)
    },
    // `issues` is the canonical "open issues" list consumed by /api/summary
    // and the OPEN ISSUES panel — it now contains only ACTIVE issues so
    // stale history cannot drive the global pulse to ATTENTION.
    issues: activeIssues,
    activeIssues,
    historicalIssues,
    lastDoctor: lastDoctor ? {
      ranAt: lastDoctor.ranAt,
      ok: !!lastDoctor.ok,
      issues: Array.isArray(lastDoctor.issues) ? lastDoctor.issues : []
    } : null,
    // Recommendations only when there are issues — the dashboard's NEXT STEP
    // banner already covers the healthy-state messaging, so an extra "no action
    // needed" panel would be redundant clutter.
    recommendedNext:
      activeIssues.length === 0
        ? []
        : activeIssues.map(i => `address: ${i}`).slice(0, 4)
  };
}

async function action(system, name) {
  const F = system.files;
  if (name === 'doctor') {
    const r = await runProcess(process.execPath, [resolveWorkspacePath(F.doctorScript), '--json'], { timeoutMs: 60000 });
    // Persist the latest doctor JSON so status() can surface "last doctor"
    // immediately after the action completes — making the live page reflect
    // the freshly-checked health rather than reading file state alone.
    try {
      const m = r && r.stdout ? r.stdout.match(/\{[\s\S]*\}\s*$/) : null;
      if (m) {
        const parsed = JSON.parse(m[0]);
        fs.writeFileSync(LAST_DOCTOR_PATH, JSON.stringify({
          ranAt: new Date().toISOString(),
          ok: !!parsed.ok,
          issues: parsed.issues || [],
          schedulerType: parsed.cron && parsed.cron.schedulerType || null,
          exitCode: r.exit
        }, null, 2), 'utf8');
      }
    } catch {}
    return r;
  }
  if (name === 'dry-run-pipeline') {
    return runProcess(process.execPath, [resolveWorkspacePath(F.livePipeline)], { timeoutMs: 240000 });
  }
  if (name === 'send-morning-ping-dm') {
    // Real send via OpenClaw gateway (`openclaw gateway call send`).
    // Idempotency: keyed on news-dashboard/state.json buildId.
    const summaryPath = resolveWorkspacePath(F.telegramSummary);
    const state = readJsonOpt(resolveWorkspacePath(F.state)) || {};
    const buildId = state.buildId || null;
    const text = (readTextOpt(summaryPath, 4000) || '').trim();
    if (!buildId) return { ok: false, reason: 'no buildId in state.json — pipeline has not produced output yet' };
    if (!text)    return { ok: false, reason: 'telegram-summary.txt is empty' };

    const lastSent = readJsonOpt(LAST_SENT_PATH) || {};
    if (lastSent.buildId === buildId) {
      return {
        ok: true, duplicate: true, buildId, lastSentAt: lastSent.sentAt,
        gatewayMessageId: lastSent.gatewayMessageId || null,
        note: `buildId ${buildId} was already sent at ${lastSent.sentAt}; not sending again.`
      };
    }

    // Stable idempotency key per buildId so retries hitting the gateway also dedup.
    const idempotencyKey = 'news:morning:' + crypto.createHash('sha1').update(buildId).digest('hex').slice(0, 24);
    const dmId = system.telegram.deliveryDmId;

    const r = await runProcess(process.execPath, [
      SEND_HELPER,
      '--channel', 'telegram',
      '--to', `telegram:${dmId}`,
      '--account', 'default',
      '--session-key', `agent:main:telegram:direct:${dmId}`,
      '--text-file', summaryPath,
      '--idempotency-key', idempotencyKey
    ], { timeoutMs: 60000 });

    let parsed = null;
    try { const m = r.stdout.match(/\{[\s\S]*\}\s*$/); if (m) parsed = JSON.parse(m[0]); } catch {}

    if (r.exit !== 0 || !(parsed && parsed.ok)) {
      return { ok: false, exit: r.exit, helperOutput: parsed || r.stdout.slice(-500), stderr: r.stderr.slice(-500) };
    }

    const result = parsed.gatewayResult || {};
    const messageId = result.messageId || null;
    const sentAt = new Date().toISOString();
    fs.writeFileSync(LAST_SENT_PATH, JSON.stringify({
      buildId, sentAt, gatewayMessageId: messageId,
      idempotencyKey, target: { channel: 'telegram', to: `telegram:${dmId}`, sessionKey: `agent:main:telegram:direct:${dmId}` },
      textBytes: parsed.textBytes || null
    }, null, 2), 'utf8');

    return { ok: true, duplicate: false, buildId, sentAt, gatewayMessageId: messageId, idempotencyKey };
  }
  return { error: `unknown action: ${name}` };
}

module.exports = { status, action };

#!/usr/bin/env node
// Organizer V2 cross-module doctor.
// Usage: node doctor.js [--json]
// Aggregates orchestrator + per-module state into one snapshot.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'state');
const MODULES = path.join(ROOT, 'modules');
const ORCH_PATH = path.join(STATE_DIR, 'orchestrator.json');
const LEGACY_STATE = path.join(STATE_DIR, 'organizer-state.json');
const QUEUE_PATH = path.join(STATE_DIR, 'run-queue.json');
const TICK_LOG = path.join(ROOT, 'logs', 'tick.log');

const asJson = process.argv.includes('--json');

function stripBom(s) { return (s && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s; }
function readJsonOpt(p) { try { return JSON.parse(stripBom(fs.readFileSync(p, 'utf8'))); } catch { return null; } }
function tail(file, lines = 5) {
  try {
    const buf = stripBom(fs.readFileSync(file, 'utf8')).trimEnd().split(/\r?\n/);
    return buf.slice(Math.max(0, buf.length - lines));
  } catch { return []; }
}

const orch = readJsonOpt(ORCH_PATH);
const legacy = readJsonOpt(LEGACY_STATE);
const queue = readJsonOpt(QUEUE_PATH);

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  orchestrator: null,
  modules: {},
  legacyPipelines: null,
  queue: null,
  recentTicks: tail(TICK_LOG, 5),
  issues: []
};

if (!orch) {
  result.ok = false;
  result.issues.push(`missing ${ORCH_PATH}`);
} else {
  result.orchestrator = {
    version: orch.version,
    updatedAt: orch.updatedAt,
    enabledModules: Object.fromEntries(
      Object.entries(orch.modules).map(([k, v]) => [k, !!v.enabled])
    ),
    quietPolicy: {
      maxBlockedTicksBeforeQuiet: Object.fromEntries(
        Object.entries(orch.modules).map(([k, v]) => [k, v.maxBlockedTicksBeforeQuiet])
      )
    }
  };
  for (const [k, v] of Object.entries(orch.modules)) {
    if (v.enabled && v.consecutiveBlockedTicks >= v.maxBlockedTicksBeforeQuiet) {
      result.issues.push(`module ${k} is QUIETED — manual re-arm required`);
      result.ok = false;
    }
  }
}

// Per-module state
for (const m of ['computer', 'gmail', 'photos']) {
  const stateFile = path.join(MODULES, m, 'state.json');
  const reportsDir = path.join(MODULES, m, 'reports');
  const s = readJsonOpt(stateFile) || {};
  result.modules[m] = {
    state: stateFile,
    lastAuthAt: s.lastAuthAt || null,
    lastAuthOk: s.lastAuthOk || null,
    lastAuthMethod: s.lastAuthMethod || null,
    lastScanAt: s.lastScanAt || null,
    lastScanItems: s.lastScanItems || 0,
    lastScanMode: s.lastScanMode || null,
    lastPlanAt: s.lastPlanAt || null,
    lastPlanItems: s.lastPlanItems || 0,
    lastApprovalAt: s.lastApprovalAt || null,
    lastApprovalSha: s.lastApprovalSha || null,
    lastApplyAt: s.lastApplyAt || null,
    lastApplyDryRun: s.lastApplyDryRun != null ? s.lastApplyDryRun : null,
    lastApplyResult: s.lastApplyResult || null,
    reportsDir
  };
}

// Legacy state machine (continue-organizer.ps1's surface)
if (legacy) {
  result.legacyPipelines = {};
  for (const k of ['computer', 'gmail', 'photos']) {
    const p = (legacy.pipelines || {})[k] || {};
    result.legacyPipelines[k] = {
      status: p.status || null,
      lastReport: p.lastReport || null,
      authMode: p.authMode || null
    };
  }
}

if (queue) {
  result.queue = {
    activeRun: queue.activeRun ? queue.activeRun.id : null,
    pendingRuns: (queue.pendingRuns || []).length,
    historyCount: (queue.history || []).length
  };
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('=== Organizer V2 cross-module doctor ===');
  console.log(`checkedAt: ${result.checkedAt}`);
  if (result.orchestrator) {
    console.log(`orchestrator v${result.orchestrator.version} updatedAt=${result.orchestrator.updatedAt}`);
    console.log('enabled modules:');
    for (const [k, v] of Object.entries(result.orchestrator.enabledModules)) {
      console.log(`  ${k.padEnd(8)} ${v ? 'ENABLED' : 'disabled'}`);
    }
  }
  console.log('');
  console.log('per-module state:');
  for (const [k, v] of Object.entries(result.modules)) {
    console.log(`  [${k}]`);
    console.log(`    auth   : ${v.lastAuthAt} ok=${v.lastAuthOk} method=${v.lastAuthMethod}`);
    console.log(`    scan   : ${v.lastScanAt} mode=${v.lastScanMode} items=${v.lastScanItems}`);
    console.log(`    plan   : ${v.lastPlanAt} items=${v.lastPlanItems}`);
    console.log(`    approve: ${v.lastApprovalAt} sha=${v.lastApprovalSha}`);
    console.log(`    apply  : ${v.lastApplyAt} dryRun=${v.lastApplyDryRun} result=${JSON.stringify(v.lastApplyResult)}`);
  }
  if (result.legacyPipelines) {
    console.log('');
    console.log('legacy pipelines (continue-organizer.ps1):');
    for (const [k, v] of Object.entries(result.legacyPipelines)) {
      console.log(`  ${k.padEnd(8)} ${String(v.status).padEnd(28)} ${v.lastReport || ''}`);
    }
  }
  if (result.queue) {
    console.log(`queue: active=${result.queue.activeRun || '-'} pending=${result.queue.pendingRuns} history=${result.queue.historyCount}`);
  }
  if (result.recentTicks.length) {
    console.log('recent ticks:');
    for (const line of result.recentTicks) console.log(`  ${line}`);
  }
  console.log('');
  console.log(result.ok ? 'DOCTOR: OK' : 'DOCTOR: ATTENTION REQUIRED');
  for (const i of result.issues) console.log(`  - ${i}`);
}

process.exit(result.ok ? 0 : 2);

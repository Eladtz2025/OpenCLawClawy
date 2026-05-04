#!/usr/bin/env node
// Organizer V2 — Gmail module.
// Verbs: auth | scan | plan | approve | apply | doctor
//
// Uses the locally-installed mcporter + @presto-ai/google-workspace-mcp under
// workspace/gmail-audit/node_modules. Designed to:
//   - work when auth is healthy
//   - degrade gracefully to "preview/blocked" mode when auth or runner times out
//   - never send / delete / archive without an explicit approval package
//   - default apply mode = dry-run

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

// -----------------------------------------------------------------------------
// paths and helpers
// -----------------------------------------------------------------------------
const WORKSPACE = path.resolve(os.homedir(), '.openclaw', 'workspace');
const ORGANIZER = path.join(WORKSPACE, 'organizer');
const MOD_BASE  = path.join(ORGANIZER, 'modules', 'gmail');
const REPORTS   = path.join(MOD_BASE, 'reports');
const LOGS      = path.join(MOD_BASE, 'logs');
const STATE_PATH = path.join(MOD_BASE, 'state.json');

const SCAN_JSON     = path.join(REPORTS, 'scan-summary.json');
const SCAN_REPORT   = path.join(REPORTS, 'scan-report.md');
const PLAN_JSON     = path.join(REPORTS, 'plan.json');
const PLAN_REPORT   = path.join(REPORTS, 'plan.md');
const APPROVAL_JSON = path.join(REPORTS, 'approval-package.json');
const APPROVAL_MD   = path.join(REPORTS, 'approval-package.md');
const APPLY_JSON    = path.join(REPORTS, 'apply-log.json');
const APPLY_MD      = path.join(REPORTS, 'apply-log.md');
const LOG_PATH      = path.join(LOGS, 'module.log');

const MCPORTER = path.join(WORKSPACE, 'gmail-audit', 'node_modules', '.bin', 'mcporter.cmd');
const GMAIL_USER_SESSION_MARKER = path.join(ORGANIZER, 'state', 'gmail-user-session-success.json');
const MCPORTER_TIMEOUT_MS = 25000;

for (const d of [REPORTS, LOGS]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function stripBom(s) { return (s && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s; }
function readJsonOpt(p) { try { return JSON.parse(stripBom(fs.readFileSync(p, 'utf8'))); } catch { return null; } }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8'); }
function writeText(p, t)   { fs.writeFileSync(p, t, 'utf8'); }
function nowUtc() { return new Date().toISOString(); }
function appendLog(line) {
  fs.appendFileSync(LOG_PATH, `${nowUtc()} ${line}\n`, 'utf8');
}
function bytesHuman(n) {
  if (n == null || isNaN(n)) return '?';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(2)} ${u[i]}`;
}
function sha1Of(s) { return crypto.createHash('sha1').update(String(s), 'utf8').digest('hex'); }

function newState() {
  return {
    lastAuthAt: null, lastAuthOk: null, lastAuthMethod: null, lastAuthError: null,
    lastScanAt: null, lastScanItems: 0, lastScanMode: null,
    lastPlanAt: null, lastPlanItems: 0,
    lastApprovalAt: null, lastApprovalSha: null,
    lastApplyAt: null, lastApplyDryRun: true, lastApplyResult: null
  };
}
function updateState(patch) {
  const s = readJsonOpt(STATE_PATH) || newState();
  Object.assign(s, patch);
  writeJson(STATE_PATH, s);
}

// -----------------------------------------------------------------------------
// mcporter call wrapper
// -----------------------------------------------------------------------------
function mcporterCall(tool, kvFlags = {}) {
  // The dotted-selector form (server.tool) doesn't parse correctly when the tool
  // itself contains a dot (e.g. gmail.search). Use --server/--tool explicit form.
  if (!fs.existsSync(MCPORTER)) {
    return { ok: false, error: `mcporter binary missing at ${MCPORTER}` };
  }
  const flagArgs = Object.entries(kvFlags)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`);
  const innerArgs = [
    'call', '--server', 'google-workspace', '--tool', tool,
    ...flagArgs,
    '--output', 'json'
  ];
  // .cmd shims on Windows must be invoked via cmd.exe /c (spawnSync direct returns EINVAL).
  const r = spawnSync('cmd.exe', ['/c', MCPORTER, ...innerArgs], {
    encoding: 'utf8',
    timeout: MCPORTER_TIMEOUT_MS,
    env: { ...process.env, USERPROFILE: 'C:\\Users\\Itzhak', APPDATA: 'C:\\Users\\Itzhak\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\Itzhak\\AppData\\Local' }
  });
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT' || r.error.killed) return { ok: false, error: `timeout ${MCPORTER_TIMEOUT_MS}ms` };
    return { ok: false, error: r.error.message };
  }
  if (r.status !== 0) return { ok: false, error: `mcporter exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 200)}` };
  // try to parse JSON from stdout
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch {}
  return { ok: true, raw: r.stdout, parsed };
}

// -----------------------------------------------------------------------------
// AUTH
// -----------------------------------------------------------------------------
function verbAuth() {
  const out = { generatedAt: nowUtc(), mcporterPath: MCPORTER, marker: null, getMe: null, decision: null };
  out.marker = readJsonOpt(GMAIL_USER_SESSION_MARKER);
  // Run people.getMe with a short timeout. Outcome decides decision.
  const r = mcporterCall('people.getMe', {});
  out.getMe = r.ok
    ? { ok: true }
    : { ok: false, error: r.error };
  let decision;
  if (out.getMe.ok) decision = 'authenticated';
  else if (out.marker && out.marker.success) decision = 'authenticated_via_marker_runner_blocked';
  else if (out.getMe.error && /timeout/i.test(out.getMe.error)) decision = 'runner_timeout_auth_unknown';
  else decision = 'unauthenticated';
  out.decision = decision;
  updateState({ lastAuthAt: out.generatedAt, lastAuthOk: out.getMe.ok || out.decision === 'authenticated_via_marker_runner_blocked', lastAuthMethod: decision, lastAuthError: out.getMe.ok ? null : out.getMe.error });
  appendLog(`auth decision=${decision} getMeOk=${out.getMe.ok}`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

// -----------------------------------------------------------------------------
// SCAN — try real, fall back to "preview" mode that emits empty buckets w/ reason.
// -----------------------------------------------------------------------------
function attemptListMessages(query, maxResults = 50) {
  // Real tool name (verified via `mcporter list google-workspace --schema`):
  //   google-workspace.gmail.search   query="..."   max-results=N
  const r = mcporterCall('gmail.search', { 'query': `"${query}"`, 'max-results': maxResults });
  if (r.ok) return { ok: true, tool: 'gmail.search', raw: r.raw, parsed: r.parsed };
  return { ok: false, tool: 'gmail.search', error: r.error };
}

function verbScan() {
  appendLog('scan starting');
  const auth = verbAuthForScan();
  const scan = {
    module: 'gmail', version: 1, generatedAt: nowUtc(),
    authDecision: auth.decision,
    mode: 'unknown',
    queries: {},
    totals: {},
    notes: []
  };

  // If not authenticated AND no marker → preview mode with empty buckets.
  if (auth.decision === 'unauthenticated' || auth.decision === 'runner_timeout_auth_unknown') {
    scan.mode = 'preview-blocked';
    scan.notes.push('Auth blocked or unknown; scan emitted empty result. Re-arm gmail (see auth verb) and re-run.');
    for (const q of ['large','old_unread','newsletters','promotions']) {
      scan.queries[q] = { ok: false, items: [], reason: 'auth-blocked' };
    }
  } else {
    scan.mode = (auth.decision === 'authenticated') ? 'live' : 'preview-marker-only';
    // Live or marker-only: we can try to list, but the runner historically times out.
    // For each query we attempt; if runner blocks, record the blocker per-query and continue.
    const queries = {
      large:        'has:attachment larger:5M',
      old_unread:   'is:unread older_than:1y',
      newsletters:  'category:promotions OR list:* OR unsubscribe',
      promotions:   'category:promotions'
    };
    for (const [k, q] of Object.entries(queries)) {
      const r = attemptListMessages(q, 50);
      if (r.ok) {
        const items = (r.parsed && Array.isArray(r.parsed.messages)) ? r.parsed.messages : (Array.isArray(r.parsed) ? r.parsed : []);
        scan.queries[k] = { ok: true, tool: r.tool, items: items.slice(0, 50), itemCount: items.length };
      } else {
        scan.queries[k] = { ok: false, error: r.error || 'unknown' };
        scan.notes.push(`query "${k}" failed: ${r.error}`);
      }
    }
  }

  scan.totals = {
    queriesTried: Object.keys(scan.queries).length,
    queriesOk:    Object.values(scan.queries).filter(q => q.ok).length,
    itemsFound:   Object.values(scan.queries).reduce((a, q) => a + ((q.items || []).length), 0)
  };
  writeJson(SCAN_JSON, scan);

  const md = [
    '# Gmail scan report', '',
    `Generated: ${scan.generatedAt}`,
    `mode: ${scan.mode}`,
    `authDecision: ${scan.authDecision}`,
    '',
    '## Queries',
    '',
    '| query | ok | itemCount | note |',
    '|-------|----|-----------|------|',
    ...Object.entries(scan.queries).map(([k, v]) => `| ${k} | ${v.ok} | ${(v.items || []).length} | ${v.error || v.tool || ''} |`),
    '',
    '## Notes',
    '',
    ...(scan.notes.length ? scan.notes.map(n => `- ${n}`) : ['- (none)']),
    ''
  ].join('\n');
  writeText(SCAN_REPORT, md);

  updateState({ lastScanAt: scan.generatedAt, lastScanItems: scan.totals.itemsFound, lastScanMode: scan.mode });
  appendLog(`scan complete mode=${scan.mode} queriesOk=${scan.totals.queriesOk}/${scan.totals.queriesTried} items=${scan.totals.itemsFound}`);
  console.log(SCAN_REPORT);
}

function verbAuthForScan() {
  // lightweight version — does not console-log
  const r = mcporterCall('people.getMe', {});
  const marker = readJsonOpt(GMAIL_USER_SESSION_MARKER);
  let decision;
  if (r.ok) decision = 'authenticated';
  else if (marker && marker.success) decision = 'authenticated_via_marker_runner_blocked';
  else if (r.error && /timeout/i.test(r.error)) decision = 'runner_timeout_auth_unknown';
  else decision = 'unauthenticated';
  return { decision, getMeOk: r.ok, marker: !!(marker && marker.success) };
}

// -----------------------------------------------------------------------------
// PLAN — turn scan buckets into proposed actions.
// All actions are LABEL-ONLY by default (never delete; never archive without approval).
// -----------------------------------------------------------------------------
function verbPlan() {
  const scan = readJsonOpt(SCAN_JSON);
  if (!scan) throw new Error('no scan-summary.json — run scan first');

  const items = [];
  function add(kind, gmailQuery, rationale, label) {
    items.push({ kind, gmailQuery, rationale, proposedLabel: label, action: 'add-label-only' });
  }

  add('large-attachment',  'has:attachment larger:5M',                  'large attachments occupy mailbox quota', 'Cleanup/Large');
  add('old-unread',        'is:unread older_than:1y',                   'unread for over a year — likely never opened', 'Cleanup/OldUnread');
  add('newsletter',        'list:* OR unsubscribe',                     'list-subscribed mail; candidate to triage', 'Cleanup/Newsletter');
  add('promotional',       'category:promotions',                       'category promotions — likely batch-clean', 'Cleanup/Promo');
  add('noisy-sender',      'from:* (heuristic via cron history)',       'manual heuristic; populate after scan ok', 'Cleanup/Noisy');

  const plan = {
    module: 'gmail', version: 1,
    generatedAt: nowUtc(),
    scanGeneratedAt: scan.generatedAt,
    scanMode: scan.mode,
    items,
    totals: { count: items.length },
    safetyRules: [
      'Apply mode performs ONLY label-add operations.',
      'Never delete, archive, move, or send messages.',
      'Each item must be in the approval package to be applied.',
      'Apply default is dry-run.'
    ]
  };
  writeJson(PLAN_JSON, plan);

  const md = [
    '# Gmail plan', '',
    `Generated: ${plan.generatedAt} (scan ${plan.scanGeneratedAt}, mode=${plan.scanMode})`,
    '', '## Proposed label adds (no destructive action)',
    '', '| kind | query | label | rationale |',
    '|------|-------|-------|-----------|',
    ...items.map(i => `| ${i.kind} | \`${i.gmailQuery}\` | ${i.proposedLabel} | ${i.rationale} |`),
    '', '## Safety rules',
    '', ...plan.safetyRules.map(r => `- ${r}`),
    ''
  ].join('\n');
  writeText(PLAN_REPORT, md);
  updateState({ lastPlanAt: plan.generatedAt, lastPlanItems: items.length });
  appendLog(`plan complete items=${items.length}`);
  console.log(PLAN_REPORT);
}

// -----------------------------------------------------------------------------
// APPROVE — write package; default approves all label-add items.
// -----------------------------------------------------------------------------
function verbApprove() {
  const plan = readJsonOpt(PLAN_JSON);
  if (!plan) throw new Error('no plan.json — run plan first');
  const onlyKinds = process.argv.slice(3).find(a => a.startsWith('--kinds='));
  const allow = onlyKinds ? new Set(onlyKinds.slice('--kinds='.length).split(',').filter(Boolean)) : null;
  const items = plan.items.filter(i => !allow || allow.has(i.kind));
  const pkg = {
    module: 'gmail', version: 1,
    generatedAt: nowUtc(),
    planGeneratedAt: plan.generatedAt,
    items,
    totals: { count: items.length },
    contractSha1: sha1Of(items.map(i => `${i.kind}|${i.gmailQuery}|${i.proposedLabel}`).join('\n')),
    safetyRules: plan.safetyRules
  };
  writeJson(APPROVAL_JSON, pkg);
  const md = [
    '# Gmail approval package', '',
    `Generated: ${pkg.generatedAt}`,
    `Items: ${pkg.totals.count}`,
    `contractSha1: ${pkg.contractSha1}`,
    '', '## Approved label-add operations',
    '', '| kind | query | label |',
    '|------|-------|-------|',
    ...items.map(i => `| ${i.kind} | \`${i.gmailQuery}\` | ${i.proposedLabel} |`),
    '', '## Safety rules',
    '', ...pkg.safetyRules.map(r => `- ${r}`),
    ''
  ].join('\n');
  writeText(APPROVAL_MD, md);
  updateState({ lastApprovalAt: pkg.generatedAt, lastApprovalSha: pkg.contractSha1 });
  appendLog(`approve complete items=${items.length} contract=${pkg.contractSha1}`);
  console.log(APPROVAL_MD);
}

// -----------------------------------------------------------------------------
// APPLY — dry-run by default; --no-dry-run requires auth working AND a label tool path.
// Even with --no-dry-run we ONLY apply labels, never delete/archive.
// -----------------------------------------------------------------------------
function verbApply() {
  const pkg = readJsonOpt(APPROVAL_JSON);
  if (!pkg) throw new Error('no approval-package.json — run approve first');
  const dryRun = !process.argv.includes('--no-dry-run');
  const auth = verbAuthForScan();
  const log = [];
  if (dryRun) {
    for (const it of pkg.items) {
      log.push({ kind: it.kind, query: it.gmailQuery, label: it.proposedLabel, result: 'would-add-label', dryRun: true });
    }
  } else if (auth.decision !== 'authenticated') {
    for (const it of pkg.items) {
      log.push({ kind: it.kind, query: it.gmailQuery, label: it.proposedLabel, result: 'auth-blocked', error: `auth.decision=${auth.decision}`, dryRun: false });
    }
  } else {
    // Live label-add path. The @presto-ai/google-workspace-mcp gmail.* tools we have are:
    //   gmail.search, gmail.get, gmail.modify (per-message), gmail.send, gmail.createDraft,
    //   gmail.sendDraft, gmail.listLabels, gmail.downloadAttachment.
    // gmail.modify operates on a single messageId. To label-by-query we'd need to
    // search → for each id → modify. That's a multi-step apply. Implement the minimal
    // safe shape: search to get IDs (cap), then modify each. addLabels only.
    for (const it of pkg.items) {
      const sr = mcporterCall('gmail.search', { 'query': `"${it.gmailQuery}"`, 'max-results': 25 });
      if (!sr.ok) {
        log.push({ kind: it.kind, query: it.gmailQuery, label: it.proposedLabel, result: 'search-failed', error: sr.error, dryRun: false });
        continue;
      }
      const messages = (sr.parsed && (sr.parsed.messages || sr.parsed.results)) || [];
      const ids = messages.map(m => m.id || m.messageId).filter(Boolean);
      if (ids.length === 0) {
        log.push({ kind: it.kind, query: it.gmailQuery, label: it.proposedLabel, result: 'no-matching-messages', dryRun: false });
        continue;
      }
      let added = 0; let errs = 0;
      for (const id of ids) {
        const mr = mcporterCall('gmail.modify', { 'message-id': id, 'add-labels': it.proposedLabel });
        if (mr.ok) added++; else errs++;
      }
      log.push({ kind: it.kind, query: it.gmailQuery, label: it.proposedLabel, result: 'labelled-individually', searchHits: ids.length, labeled: added, errors: errs, dryRun: false });
    }
  }
  const applyDoc = {
    module: 'gmail', version: 1,
    generatedAt: nowUtc(),
    approvalContractSha1: pkg.contractSha1,
    dryRun, log,
    totals: {
      considered: log.length,
      wouldAdd:    log.filter(x => x.result === 'would-add-label').length,
      added:       log.filter(x => x.result === 'label-added').length,
      authBlocked: log.filter(x => x.result === 'auth-blocked').length,
      noTool:      log.filter(x => x.result === 'no-compatible-tool').length
    }
  };
  writeJson(APPLY_JSON, applyDoc);
  const md = [
    '# Gmail apply log', '',
    `Generated: ${applyDoc.generatedAt}`,
    `dryRun: ${applyDoc.dryRun}`,
    `Considered: ${applyDoc.totals.considered} | wouldAdd: ${applyDoc.totals.wouldAdd} | added: ${applyDoc.totals.added} | authBlocked: ${applyDoc.totals.authBlocked} | noTool: ${applyDoc.totals.noTool}`,
    ''
  ].join('\n');
  writeText(APPLY_MD, md);
  updateState({ lastApplyAt: applyDoc.generatedAt, lastApplyDryRun: dryRun, lastApplyResult: applyDoc.totals });
  appendLog(`apply complete dryRun=${dryRun} considered=${applyDoc.totals.considered}`);
  console.log(APPLY_MD);
}

function verbDoctor() {
  const s = readJsonOpt(STATE_PATH);
  console.log('=== Gmail module doctor ===');
  if (!s) { console.log('no state yet (run auth or scan first)'); return; }
  console.log(`lastAuthAt:     ${s.lastAuthAt} ok=${s.lastAuthOk} method=${s.lastAuthMethod}`);
  if (s.lastAuthError) console.log(`lastAuthError:  ${String(s.lastAuthError).slice(0, 160)}`);
  console.log(`lastScanAt:     ${s.lastScanAt} mode=${s.lastScanMode} items=${s.lastScanItems}`);
  console.log(`lastPlanAt:     ${s.lastPlanAt} items=${s.lastPlanItems}`);
  console.log(`lastApprovalAt: ${s.lastApprovalAt} sha=${s.lastApprovalSha}`);
  console.log(`lastApplyAt:    ${s.lastApplyAt} dryRun=${s.lastApplyDryRun}`);
  if (s.lastApplyResult) console.log(`lastApplyResult: ${JSON.stringify(s.lastApplyResult)}`);
}

// -----------------------------------------------------------------------------
// dispatch
// -----------------------------------------------------------------------------
const verb = process.argv[2];
try {
  switch (verb) {
    case 'auth':    verbAuth(); break;
    case 'scan':    verbScan(); break;
    case 'plan':    verbPlan(); break;
    case 'approve': verbApprove(); break;
    case 'apply':   verbApply(); break;
    case 'doctor':  verbDoctor(); break;
    default:
      console.error('usage: node gmail.js {auth|scan|plan|approve|apply|doctor}'); process.exit(2);
  }
} catch (e) {
  appendLog(`ERROR ${verb}: ${e.message}`);
  console.error(`ERROR (${verb}): ${e.message}`);
  process.exit(1);
}

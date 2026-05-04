// Status provider for Organizer V2.
const path = require('path');
const { readJsonOpt, readTextOpt, resolveWorkspacePath, runProcess, WORKSPACE } = require('../lib/runtime');

// Compose a structured "scan summary" the dashboard can render as cards.
// Keeps backend logic minimal — only normalizes the on-disk scan-summary.json
// of each module so the UI doesn't have to parse raw markdown.
function readComputerScanSummary() {
  const j = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', 'computer', 'reports', 'scan-summary.json'));
  if (!j) return null;
  const filtered = readJsonOpt(path.join(WORKSPACE, 'disk_audit', 'filtered_summary.json')) || {};
  const audit = readJsonOpt(path.join(WORKSPACE, 'disk_audit', 'audit_meta.json')) || {};

  const disk = (j.disk || []).filter(d => d.totalBytes > 0).map(d => ({
    name: d.name,
    usedHuman: d.usedHuman,
    freeHuman: d.freeHuman,
    totalBytes: d.totalBytes,
    usedBytes: d.usedBytes,
    freeBytes: d.freeBytes,
    pctUsed: d.totalBytes ? Math.round((d.usedBytes / d.totalBytes) * 100) : null
  }));

  const t = j.totals || {};
  function fmtBytes(n) {
    if (!n || n < 1024) return (n || 0) + ' B';
    const u = ['KB','MB','GB','TB']; let i = -1, v = n;
    do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
    return v.toFixed(v < 10 ? 2 : 1) + ' ' + u[i];
  }
  const totals = {
    largeFiles: t.largeUserspaceCount ?? null,
    oldDownloads: t.oldDownloadsCount ?? null,
    desktopItems: t.desktopClutterCount ?? null,
    tempCache: t.tempCacheCount ?? null,
    duplicateGroups: t.duplicateGroupsCount ?? null,
    duplicateReclaimableHuman: t.duplicateBytesEst ? fmtBytes(t.duplicateBytesEst) : null,
    startupApps: t.startupAppsCount ?? null,
    installedApps: t.installedAppsCount ?? null,
    timeBudgetExceeded: !!t.timeBudgetExceeded
  };

  return {
    generatedAt: j.generatedAt || null,
    scanRoot: j.scanRoot || null,
    disk,
    windowsHealth: j.windowsHealth || null,
    totals,
    fromDiskAudit: {
      emptyDirCandidates: filtered.emptyDirCandidates ?? null,
      zeroByteCandidates: filtered.zeroFileCandidates ?? null,
      coldFileCandidates: filtered.coldFileCandidates ?? null,
      auditedFileCount: audit.fileCount ?? null,
      auditedDirCount: audit.dirCount ?? null
    }
  };
}

function readGenericScanSummary(modName) {
  const j = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', modName, 'reports', 'scan-summary.json'));
  if (!j) return null;
  return j;
}

function fmtBytes(n) {
  if (n == null) return null;
  if (n < 1024) return (n || 0) + ' B';
  const u = ['KB','MB','GB','TB'];
  let i = -1, v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return v.toFixed(v < 10 ? 2 : 1) + ' ' + u[i];
}

// Build the user-facing highlights block per module — what was actually found,
// shown as concrete items the user can take action on, not abstract pipeline state.
function readComputerHighlights() {
  const plan = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', 'computer', 'reports', 'plan.json'));
  const summary = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', 'computer', 'reports', 'scan-summary.json'));
  if (!plan && !summary) return null;
  const buckets = (plan && plan.buckets) || {};
  const review = Array.isArray(buckets.manualReview) ? buckets.manualReview.slice(0, 12).map(it => ({
    path: it.path,
    sizeBytes: it.sizeBytes,
    sizeHuman: it.sizeHuman,
    lastTouched: (it.rationale || '').match(/last touched (\S+)/)?.[1] || null,
    kind: it.kind
  })) : [];
  const totals = (plan && plan.totals) || {};
  const reclaimableBytes = totals.manualReviewBytes || 0;
  const reclaimableHuman = fmtBytes(reclaimableBytes);
  const disk = (summary && summary.disk || []).find(d => d.totalBytes > 0);
  const pctFree = disk && disk.totalBytes ? Math.round(100 * (disk.freeBytes / disk.totalBytes)) : null;
  const headline = (totals.manualReviewCount > 0 && reclaimableHuman)
    ? `${totals.manualReviewCount} large files (~${reclaimableHuman}) on ${disk ? disk.name + ':' : 'C:'} ready to review`
    : (totals.safeTrashCount > 0)
      ? `${totals.safeTrashCount} files safe to recycle`
      : disk
        ? `${disk.name}: drive ${pctFree}% free — no cleanup candidates flagged`
        : null;
  return {
    headline,
    diskName: disk?.name || 'C',
    diskFreeHuman: disk?.freeHuman || null,
    diskTotalHuman: disk ? fmtBytes(disk.totalBytes) : null,
    pctFree,
    reclaimableHuman,
    topFiles: review,
    safeTrashCount: totals.safeTrashCount || 0,
    archiveCount: totals.archiveCount || 0,
    manualReviewCount: totals.manualReviewCount || 0
  };
}

function readGmailHighlights() {
  const scan = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', 'gmail', 'reports', 'scan-summary.json'));
  const plan = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', 'gmail', 'reports', 'plan.json'));
  if (!scan && !plan) return null;
  const queryLabels = {
    large:       { label: 'Large attachments', query: 'has:attachment larger:5M', proposedLabel: 'Cleanup/Large', why: 'Reclaim mailbox quota' },
    old_unread:  { label: 'Unread > 1 year',   query: 'is:unread older_than:1y', proposedLabel: 'Cleanup/OldUnread', why: 'Probably never going to read' },
    newsletters: { label: 'Newsletters',       query: 'list:* OR unsubscribe',    proposedLabel: 'Cleanup/Newsletter', why: 'List-subscribed mail; review or unsubscribe' },
    promotions:  { label: 'Promotions',        query: 'category:promotions',      proposedLabel: 'Cleanup/Promo',     why: 'Marketing — usually safe to clean' }
  };
  const queries = (scan && scan.queries) || {};
  const buckets = Object.entries(queryLabels).map(([key, meta]) => {
    const q = queries[key];
    return {
      key, ...meta,
      itemCount: q?.itemCount || 0,
      ok: q?.ok !== false,
      gmailUrl: 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(meta.query)
    };
  });
  const total = buckets.reduce((s, b) => s + (b.itemCount || 0), 0);
  const headline = total > 0
    ? `${total} messages across ${buckets.filter(b => b.itemCount > 0).length} cleanup buckets — open any bucket in Gmail`
    : (scan ? 'Inbox is clean — no cleanup candidates' : null);
  return {
    headline,
    total,
    buckets,
    plannedLabels: ((plan && plan.items) || []).length,
    authMode: scan?.mode || null
  };
}

function readPhotosHighlights() {
  const scan = readJsonOpt(path.join(WORKSPACE, 'organizer', 'modules', 'photos', 'reports', 'scan-summary.json'));
  if (!scan) return null;
  const d = scan.data || {};
  const totalMedia = d.mediaItems?.count || 0;
  const albums = d.albums?.count || 0;
  const screenshots = d.screenshotsLikely?.count || 0;
  const downloaded = d.downloadedLikely?.count || 0;
  const old = d.oldMedia?.count || 0;
  const empty = totalMedia === 0 && albums === 0;
  const headline = empty
    ? 'Photos library appears empty in scan window — auth OK, but nothing to organize yet'
    : `${totalMedia} media items, ${albums} albums — ${screenshots + downloaded + old} candidates flagged`;
  return {
    headline,
    empty,
    totalMedia,
    albums,
    buckets: [
      { key: 'screenshots',  label: 'Screenshots',     count: screenshots, action: 'Group into "Screenshots" album' },
      { key: 'downloaded',   label: 'Downloaded media', count: downloaded, action: 'Group into "Downloaded" album' },
      { key: 'oldMedia',     label: 'Pre-2020 media',  count: old,         action: 'Group for archival review' }
    ],
    authMode: scan.mode || null
  };
}

// Compute the next pipeline step for a module given its state timestamps.
function computeNextStep(st) {
  const t = ts => ts ? new Date(ts).getTime() : 0;
  const scan = t(st.lastScanAt), plan = t(st.lastPlanAt),
        appr = t(st.lastApprovalAt), appl = t(st.lastApplyAt);
  if (!scan)             return { step: 'scan',    label: 'Click SCAN to inspect this area',                        action: 'scan' };
  if (!plan || plan < scan) return { step: 'plan',    label: 'Next: click PLAN to generate cleanup recommendations',     action: 'plan' };
  if (!appr || appr < plan) return { step: 'approve', label: 'Next: review the approval package, then click APPROVE',    action: 'approve' };
  if (!appl || appl < appr) return { step: 'apply',   label: 'Next: run APPLY (dry-run) to preview what would change',   action: 'apply' };
  return { step: 'rerun', label: 'Pipeline up to date — re-run SCAN when you want fresh data', action: 'scan' };
}

async function status(system) {
  const F = system.files;
  const orchestrator = readJsonOpt(resolveWorkspacePath(F.orchestratorState)) || {};
  const tickLog = (readTextOpt(resolveWorkspacePath(F.tickLog), 1500) || '').trimEnd().split(/\r?\n/).filter(Boolean).slice(-5);

  const computer = readJsonOpt(resolveWorkspacePath(F.computerState)) || {};
  const gmail = readJsonOpt(resolveWorkspacePath(F.gmailState)) || {};
  const photos = readJsonOpt(resolveWorkspacePath(F.photosState)) || {};

  const modulesCfg = (orchestrator.modules || {});
  const issues = [];
  for (const [name, cfg] of Object.entries(modulesCfg)) {
    if (cfg.enabled && cfg.consecutiveBlockedTicks >= cfg.maxBlockedTicksBeforeQuiet) {
      issues.push(`module ${name} is QUIETED — manual re-arm required`);
    }
  }

  const scanSummaries = {
    computer: readComputerScanSummary(),
    gmail:    readGenericScanSummary('gmail'),
    photos:   readGenericScanSummary('photos')
  };
  const highlights = {
    computer: readComputerHighlights(),
    gmail:    readGmailHighlights(),
    photos:   readPhotosHighlights()
  };

  function moduleSummary(label, st, cfg, modName) {
    return {
      label,
      enabled: !!(cfg && cfg.enabled),
      lastAuthAt: st.lastAuthAt || null,
      lastAuthOk: st.lastAuthOk == null ? null : !!st.lastAuthOk,
      lastAuthMethod: st.lastAuthMethod || null,
      lastScanAt: st.lastScanAt || null,
      lastScanItems: st.lastScanItems || 0,
      lastScanMode: st.lastScanMode || null,
      lastPlanAt: st.lastPlanAt || null,
      lastPlanItems: st.lastPlanItems || 0,
      lastApprovalAt: st.lastApprovalAt || null,
      lastApprovalSha: st.lastApprovalSha || null,
      lastApplyAt: st.lastApplyAt || null,
      lastApplyDryRun: st.lastApplyDryRun != null ? !!st.lastApplyDryRun : null,
      lastApplyResult: st.lastApplyResult || null,
      scanSummary: scanSummaries[modName] || null,
      highlights: highlights[modName] || null,
      nextStep: computeNextStep(st)
    };
  }

  return {
    ok: issues.length === 0,
    headline: issues.length ? 'ATTENTION' : 'OK',
    summary: `modules: computer=${modulesCfg.computer?.enabled ? 'on' : 'off'} gmail=${modulesCfg.gmail?.enabled ? 'on' : 'off'} photos=${modulesCfg.photos?.enabled ? 'on' : 'off'}`,
    orchestratorVersion: orchestrator.version || null,
    orchestratorUpdatedAt: orchestrator.updatedAt || null,
    modules: {
      computer: moduleSummary('Computer Health & Optimizer', computer, modulesCfg.computer, 'computer'),
      gmail: moduleSummary('Gmail Cleanup & Organizer', gmail, modulesCfg.gmail, 'gmail'),
      photos: moduleSummary('Photos Cleanup & Organizer', photos, modulesCfg.photos, 'photos')
    },
    recentTicks: tickLog,
    files: {
      doctor: resolveWorkspacePath(F.doctorScript),
      orgctl: resolveWorkspacePath(F.orgctl),
      orchestratorState: resolveWorkspacePath(F.orchestratorState),
      tickReport: resolveWorkspacePath(F.tickReport),
      tickLog: resolveWorkspacePath(F.tickLog),
      computer: {
        state: resolveWorkspacePath(F.computerState),
        scanReport: resolveWorkspacePath(F.computerScanReport),
        approvalPackage: resolveWorkspacePath(F.computerApprovalPackage)
      },
      gmail: {
        state: resolveWorkspacePath(F.gmailState),
        scanReport: resolveWorkspacePath(F.gmailScanReport),
        approvalPackage: resolveWorkspacePath(F.gmailApprovalPackage)
      },
      photos: {
        state: resolveWorkspacePath(F.photosState),
        scanReport: resolveWorkspacePath(F.photosScanReport),
        approvalPackage: resolveWorkspacePath(F.photosApprovalPackage)
      }
    },
    issues,
    recommendedNext:
      issues.length
        ? issues
        : [
            'computer.scan or computer.plan to refresh disk audit',
            'gmail.scan or gmail.plan when ready to add Cleanup/* labels',
            'photos.scan to inspect API responsiveness'
          ]
  };
}

async function action(system, name) {
  // All organizer actions dispatch through orgctl.js so the same args/contract used
  // from Telegram/CLI later land here unchanged.
  const orgctl = resolveWorkspacePath(system.files.orgctl);

  if (name === 'doctor') {
    return runProcess(process.execPath, [orgctl, 'doctor'], { timeoutMs: 30000 });
  }
  if (name === 'tick') {
    return runProcess('powershell', ['-ExecutionPolicy', 'Bypass', '-File', resolveWorkspacePath(system.files.tickScript)], { timeoutMs: 60000 });
  }
  // module actions: <module>.<verb>
  const m = name.match(/^(computer|gmail|photos)\.(scan|plan|approve|apply|auth|doctor)$/);
  if (m) {
    const [, mod, verb] = m;
    return runProcess(process.execPath, [orgctl, mod, verb], { timeoutMs: 240000 });
  }
  return { error: `unknown action: ${name}` };
}

module.exports = { status, action };

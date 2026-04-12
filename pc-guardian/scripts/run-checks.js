const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = readJson(path.join(ROOT, 'config', 'config.json'));
const RULES = readJson(path.join(ROOT, 'config', 'rules.json'));
const STATE_PATH = path.join(ROOT, CONFIG.paths.state_file);
const DASHBOARD_DATA_PATH = path.join(ROOT, CONFIG.paths.dashboard_data_file);
const DASHBOARD_FILE_PATH = path.join(ROOT, CONFIG.paths.dashboard_file);
const LOG_DIR = path.join(ROOT, CONFIG.paths.log_dir);
const IS_DRY_RUN = process.argv.includes('--dry-run');

ensureDir(path.dirname(STATE_PATH));
ensureDir(path.dirname(DASHBOARD_DATA_PATH));
ensureDir(LOG_DIR);

const previousState = fs.existsSync(STATE_PATH) ? readJson(STATE_PATH) : { recent_failures: [], last_fixes: [], alerts: {} };
const now = new Date().toISOString();
const logLines = [];
const fixes = [];
const failures = [];
const offenders = [];

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }
function appendLog(line) { logLines.push('[' + new Date().toISOString() + '] ' + line); }
function runPs(command, fallback = null, options = {}) {
  try {
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: options.timeoutMs || 15000 });
    return out.trim();
  } catch (error) {
    if (!options.silent) appendLog('PowerShell failed: ' + error.message);
    return fallback;
  }
}
function runOpenClaw(args, options = {}) {
  return { ok: false, stdout: '', command: null, skipped: true, reason: 'disabled_in_process' };
}
function severityRank(status) { return status === 'CRITICAL' ? 3 : status === 'WARNING' ? 2 : status === 'OK' ? 1 : 0; }
function confidenceRank(level) { return level === 'high' ? 3 : level === 'medium' ? 2 : 1; }
function pickStatus(items) {
  let status = 'OK';
  for (const item of items) if (severityRank(item.status) > severityRank(status)) status = item.status;
  return status;
}
function summarizeIssues(items) { return items.filter(x => x.status !== 'OK').map(x => x.summary); }
function toNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function arrayify(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function truncateArray(arr, max) { return arr.slice(0, max); }
function isRecentFix(fixType, target, windowMinutes = 30) {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  return arrayify(previousState.last_fixes).some(f => f.type === fixType && f.target === target && Date.parse(f.time || 0) >= cutoff && f.result === 'success');
}
function safeDeleteFile(file) {
  if (IS_DRY_RUN) return true;
  try { fs.unlinkSync(file); return true; } catch { return false; }
}
function rotateLogs() {
  const files = fs.readdirSync(LOG_DIR).filter(x => x.endsWith('.log')).map(name => ({ name, full: path.join(LOG_DIR, name), stat: fs.statSync(path.join(LOG_DIR, name)) })).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);
  for (const file of files) {
    if (file.stat.size > CONFIG.thresholds.max_log_size_mb * 1024 * 1024) {
      const archive = file.full.replace(/\.log$/, '.' + Date.now() + '.log');
      if (!IS_DRY_RUN) fs.renameSync(file.full, archive);
    }
  }
  const all = fs.readdirSync(LOG_DIR).filter(x => x.endsWith('.log')).map(name => ({ name, full: path.join(LOG_DIR, name), stat: fs.statSync(path.join(LOG_DIR, name)) })).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);
  for (const file of all.slice(CONFIG.thresholds.max_log_files)) safeDeleteFile(file.full);
}
function writeLog() {
  const file = path.join(LOG_DIR, 'pc-guardian.log');
  const prior = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const merged = prior.concat(logLines).slice(-CONFIG.monitoring.max_log_lines);
  fs.writeFileSync(file, merged.join(os.EOL) + os.EOL, 'utf8');
  rotateLogs();
}
function addFailure(kind, summary, details, statusHint = null) { failures.push({ time: now, kind, summary, details, status: statusHint }); }
function addFix(type, target, result, details) { fixes.push({ time: now, type, target, result, details }); }
function cleanupOldFiles(rule, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const deleted = [];
  function walk(dir, depth) {
    if (depth > rule.max_depth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(full);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (stat.mtimeMs < cutoff && safeDeleteFile(full)) deleted.push(full);
      } catch {}
    }
  }
  walk(rule.path, 0);
  return deleted;
}
function stopProcess(pid) {
  if (IS_DRY_RUN) return true;
  try { execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', timeout: 10000 }); return true; } catch { return false; }
}
function restartService(name) {
  if (IS_DRY_RUN) return true;
  return runPs("Restart-Service -Name '" + name.replace(/'/g, "''") + "' -Force", null, { timeoutMs: 15000 }) !== null;
}
function startTask(name) {
  if (IS_DRY_RUN) return true;
  try { execFileSync('schtasks', ['/Run', '/TN', name], { stdio: 'ignore', timeout: 10000 }); return true; } catch { return false; }
}
function endTask(name) {
  if (IS_DRY_RUN) return true;
  try { execFileSync('schtasks', ['/End', '/TN', name], { stdio: 'ignore', timeout: 10000 }); return true; } catch { return false; }
}
function safeRecoverOpenClawTask(taskName, taskState) {
  const state = String(taskState || '').toLowerCase();
  const numericState = toNumber(taskState, -1);
  const healthy = state === 'ready' || state === 'running' || numericState === 1 || numericState === 3 || numericState === 4;
  if (healthy) return { attempted: false, result: 'skipped_healthy', details: 'Task healthy: ' + taskState };
  const ended = endTask(taskName);
  const started = startTask(taskName);
  return { attempted: true, result: ended && started ? 'success' : 'failed', details: 'Task state was ' + taskState + ', end=' + ended + ', run=' + started };
}
function disableCronJob(jobId) {
  if (IS_DRY_RUN) return { ok: true, details: 'dry-run' };
  const result = runOpenClaw(['cron', 'update', jobId, '--enabled', 'false'], { timeoutMs: 20000, silent: true });
  if (result.ok) return { ok: true, details: 'disabled via ' + result.command };
  return { ok: false, details: 'openclaw cli unavailable' };
}
function getJson(command, fallback, options = {}) {
  const out = runPs(command, null, options);
  if (!out) return fallback;
  try { return JSON.parse(out); } catch { return fallback; }
}
function readOpenClawCronJobs() {
  const statePath = path.join(process.env.USERPROFILE || '', '.openclaw', 'state', 'gateway-cron-jobs.json');
  if (fs.existsSync(statePath)) {
    try {
      const json = readJson(statePath);
      if (Array.isArray(json)) return { jobs: json, source: 'state-cache' };
      if (Array.isArray(json.jobs)) return { jobs: json.jobs, source: 'state-cache' };
    } catch {}
  }
  return { jobs: [], source: 'unavailable' };
}
function issueInsight(issue, context = {}) {
  const kind = String(issue?.kind || '');
  const summary = String(issue?.summary || '');
  const providers = [...new Set((context.recentEvents || []).map(x => x.ProviderName).filter(Boolean))];
  const hasWifiSignal = providers.some(x => /Netwtw|Wi-?Fi|WLAN/i.test(x));
  const gatewayCount = Array.isArray(context.gateways) ? context.gateways.length : 0;
  const healthyGateways = (context.gateways || []).filter(x => x.ok).length;
  const openclawTaskCount = Array.isArray(context.openclawTasks) ? context.openclawTasks.length : 0;
  const runningOpenclawTasks = (context.openclawTasks || []).filter(x => {
    const state = String(x.State || '').toLowerCase();
    const numeric = toNumber(x.State, -1);
    return state === 'ready' || state === 'running' || numeric === 1 || numeric === 3 || numeric === 4;
  }).length;

  if (kind === 'Internet Reachability' || /msftconnecttest\.com/i.test(summary)) {
    return {
      severity: 'INFO',
      confidence: 'low',
      impact: 'כנראה מדובר ביעד בדיקת אינטרנט אחד שלא נגיש, לא בתקלה כללית בחיבור',
      next: 'להשאיר בדשבורד בלבד, ללא התראה'
    };
  }
  if (kind === 'Critical Events') {
    return {
      severity: issue.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      confidence: providers.length ? 'high' : 'medium',
      impact: hasWifiSignal ? 'יש סימנים לתקלה ברכיב רשת, מה שעלול להשפיע על קישוריות ויציבות' : 'נרשמו שגיאות מערכת עם פוטנציאל להשפעה תפעולית',
      next: 'לבדוק את רצף ה-Event Viewer סביב ' + (providers.slice(0, 3).join(', ') || 'הרכיב הבעייתי')
    };
  }
  if (kind === 'Cron Jobs') {
    return {
      severity: 'INFO',
      confidence: context.cronSource === 'unavailable' ? 'low' : 'medium',
      impact: 'אין כרגע תמונת מצב מלאה על cron jobs, אבל זה לא בהכרח מעיד על תקלה פעילה',
      next: 'להשאיר בדשבורד, ולחבר מקור cron יציב רק אם זה חשוב'
    };
  }
  if (/gateway/i.test(kind) || /OpenClaw/i.test(kind)) {
    const confidence = gatewayCount && healthyGateways < gatewayCount ? 'high' : openclawTaskCount && runningOpenclawTasks < openclawTaskCount ? 'high' : 'medium';
    return {
      severity: issue.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      confidence,
      impact: 'עשוי להשפיע ישירות על זמינות OpenClaw או routing פנימי',
      next: 'לבצע recovery בטוח רק אם המצב נשאר לא תקין'
    };
  }
  if (kind === 'Important Tasks') {
    return {
      severity: 'WARNING',
      confidence: 'medium',
      impact: 'עשוי להשפיע על אוטומציות או משימות רקע חשובות',
      next: 'לבדוק אם המשימה החסרה או המושבתת באמת נדרשת כרגע'
    };
  }
  return {
    severity: issue.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
    confidence: 'medium',
    impact: 'דורש בדיקה תפעולית לפי הרכיב שדווח',
    next: 'לבדוק אם יש השפעה אמיתית לפני פעולה'
  };
}
function computeAlert(summaryStatus, recentIssues, context = {}) {
  const lastSentAt = previousState.alerts?.last_sent_at ? Date.parse(previousState.alerts.last_sent_at) : 0;
  const lastStatus = previousState.alerts?.last_status || null;
  const cooldownMs = (CONFIG.alerts.cooldown_minutes || 20) * 60 * 1000;
  const enriched = recentIssues.map(issue => ({ ...issue, insight: issueInsight(issue, context) }));
  const alertableIssues = enriched.filter(issue => issue.insight.severity !== 'INFO' && issue.insight.confidence !== 'low');
  const effectiveStatus = pickStatus(alertableIssues.map(issue => ({ status: issue.insight.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING' })));
  const summary = alertableIssues.slice(0, 2).map(x => x.summary).join(' | ') || 'תקין';
  const shouldSend = effectiveStatus !== 'OK' && (effectiveStatus !== lastStatus || (Date.now() - lastSentAt) > cooldownMs);
  const message = effectiveStatus === 'OK' ? null : buildHumanAlert(effectiveStatus, context, alertableIssues);
  return { shouldSend, summary, status: effectiveStatus, rawStatus: summaryStatus, message, alertableIssues, enrichedIssues: enriched };
}
function buildHumanAlert(status, context = {}, issues = []) {
  const lines = [];
  const pingOk = (context.pingResults || []).filter(x => x.ok).map(x => x.target);
  const eventCount = Array.isArray(context.recentEvents) ? context.recentEvents.length : 0;

  if (status === 'CRITICAL') {
    lines.push('PC Guardian, התראה קריטית');
    lines.push(issues[0]?.insight?.impact || 'זוהתה תקלה קריטית שדורשת טיפול.');
  } else if (status === 'WARNING') {
    lines.push('PC Guardian, אזהרה');
    lines.push(issues[0]?.insight?.impact || 'זוהתה חריגה שדורשת תשומת לב.');
  } else {
    lines.push('PC Guardian');
    lines.push('המערכת תקינה כרגע.');
  }

  const impact = [...new Set(issues.map(x => x.insight?.impact).filter(Boolean))];
  if (impact.length) {
    lines.push('');
    lines.push('מה זה משפיע');
    impact.slice(0, 3).forEach(item => lines.push('- ' + item));
  }

  const checked = [];
  if (pingOk.length) checked.push('יש תקשורת ל: ' + pingOk.join(', '));
  if (eventCount) checked.push('נסרקו אירועי מערכת מה-' + CONFIG.monitoring.recent_event_hours + ' שעות האחרונות');
  issues.forEach(issue => {
    if (issue.kind === 'Critical Events') checked.push('זוהו ' + eventCount + ' אירועי שגיאה ברמת System');
    if (issue.kind === 'Cron Jobs') checked.push('אין כרגע cache זמין של cron jobs מקומיים');
    if (/gateway/i.test(issue.kind)) checked.push('נבדק health ל-gateway המקומי');
  });
  if (checked.length) {
    lines.push('');
    lines.push('מה כבר נבדק');
    [...new Set(checked)].slice(0, 4).forEach(item => lines.push('- ' + item));
  }

  const actions = [...new Set(issues.map(x => x.insight?.next).filter(Boolean))];
  lines.push('');
  lines.push('הפעולה הבאה המומלצת');
  (actions.length ? actions : ['להמשיך מעקב, כרגע לא נדרשת פעולה']).slice(0, 3).forEach((item, index) => lines.push((index + 1) + '. ' + item));

  return lines.join('\n');
}
function persistAlert(alert, delivery = {}) {
  previousState.alerts = {
    last_sent_at: now,
    last_status: alert.status,
    last_summary: alert.summary,
    last_delivery: delivery
  };
}
function writeAlertFile(alert, delivery = {}) {
  const alertFile = path.join(ROOT, 'state', 'last-alert.json');
  writeJson(alertFile, {
    sent_at: now,
    channel: CONFIG.alerts.channel,
    status: alert.status,
    message: formatAlert(alert),
    delivery
  });
}
function formatAlert(alert) {
  return alert.message || (alert.status === 'CRITICAL'
    ? CONFIG.alerts.critical_template.replace('{summary}', alert.summary)
    : alert.status === 'WARNING'
      ? CONFIG.alerts.warning_template.replace('{summary}', alert.summary)
      : CONFIG.alerts.normal_template);
}
function sendTelegramAlert(alert) {
  const telegram = CONFIG.alerts.telegram || {};
  if (!telegram.bot_token || !telegram.chat_id) return { sent: false, mode: 'disabled', reason: 'telegram_not_configured' };
  if (IS_DRY_RUN) return { sent: true, mode: 'dry-run', reason: 'dry_run' };
  const tempPath = path.join(ROOT, 'state', 'telegram-payload.json');
  const payload = {
    chat_id: telegram.chat_id,
    text: formatAlert(alert),
    disable_notification: !!telegram.silent
  };
  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload), 'utf8');
    const out = execFileSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      "$payload = Get-Content -Raw -Path '" + tempPath.replace(/'/g, "''") + "' | ConvertFrom-Json; Invoke-RestMethod -Method Post -Uri 'https://api.telegram.org/bot" + String(telegram.bot_token).replace(/'/g, "''") + "/sendMessage' -Body @{ chat_id = $payload.chat_id; text = $payload.text; disable_notification = [bool]$payload.disable_notification } | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 12000, windowsHide: true }).trim();
    safeDeleteFile(tempPath);
    const parsed = JSON.parse(out);
    return { sent: !!parsed.ok, mode: 'telegram', response: parsed };
  } catch (error) {
    safeDeleteFile(tempPath);
    appendLog('Telegram alert failed: ' + error.message);
    return { sent: false, mode: 'telegram', reason: error.message };
  }
}
function publishDashboard(dataFile, htmlFile) {
  const publish = CONFIG.dashboard_publish || {};
  if (!publish.enabled) return { ok: false, mode: 'disabled' };
  if (publish.mode === 'copy' && publish.target_dir) {
    if (!IS_DRY_RUN) {
      ensureDir(publish.target_dir);
      fs.copyFileSync(dataFile, path.join(publish.target_dir, path.basename(dataFile)));
      fs.copyFileSync(htmlFile, path.join(publish.target_dir, path.basename(htmlFile)));
    }
    return { ok: true, mode: 'copy', target: publish.target_dir };
  }
  if (publish.mode === 'git' && publish.repo_dir) {
    try {
      const repoDir = publish.repo_dir;
      ensureDir(repoDir);
      if (!IS_DRY_RUN) {
        fs.copyFileSync(dataFile, path.join(repoDir, publish.data_file_name || 'data.json'));
        fs.copyFileSync(htmlFile, path.join(repoDir, publish.html_file_name || 'index.html'));
        const status = spawnSync('git', ['status', '--short'], { cwd: repoDir, encoding: 'utf8', timeout: 15000, windowsHide: true });
        if (status.status === 0 && status.stdout.trim()) {
          spawnSync('git', ['add', '.'], { cwd: repoDir, encoding: 'utf8', timeout: 15000, windowsHide: true });
          spawnSync('git', ['commit', '-m', publish.commit_message || 'Update PC Guardian dashboard'], { cwd: repoDir, encoding: 'utf8', timeout: 15000, windowsHide: true });
          spawnSync('git', ['push', publish.remote || 'origin', publish.branch || 'main'], { cwd: repoDir, encoding: 'utf8', timeout: 30000, windowsHide: true });
        }
      }
      return { ok: true, mode: 'git', target: repoDir };
    } catch (error) {
      appendLog('Dashboard publish failed: ' + error.message);
      return { ok: false, mode: 'git', reason: error.message };
    }
  }
  return { ok: false, mode: 'misconfigured' };
}

const cpuLoad = toNumber(runPs('(Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples[0].CookedValue.ToString("F2")', '0', { silent: true }));
const mem = getJson('$os = Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{ TotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2); FreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2) } | ConvertTo-Json -Compress', { TotalGB: 0, FreeGB: 0 }, { silent: true });
const ramUsedPct = mem.TotalGB > 0 ? ((mem.TotalGB - mem.FreeGB) / mem.TotalGB) * 100 : 0;
const disks = arrayify(getJson('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{n="FreeGB";e={[math]::Round($_.FreeSpace/1GB,2)}},@{n="SizeGB";e={[math]::Round($_.Size/1GB,2)}} | ConvertTo-Json -Compress', [], { silent: true }));
const diskActivity = toNumber(runPs('(Get-Counter "\\PhysicalDisk(_Total)\\% Disk Time").CounterSamples[0].CookedValue.ToString("F2")', '0', { silent: true }));
const pingResults = CONFIG.monitoring.connectivity_targets.map(target => ({ target, ok: /True/i.test(runPs('Test-Connection -ComputerName "' + target + '" -Count 1 -Quiet', 'False', { silent: true }) || 'False') }));
const webResults = CONFIG.monitoring.internet_targets.map(target => ({ target, ok: /^(200|204)$/i.test(String(runPs('try { (Invoke-WebRequest -UseBasicParsing -Uri "' + target + '" -TimeoutSec 5).StatusCode } catch { 0 }', '0', { silent: true }))) }));
const topProcesses = arrayify(getJson('Get-Process | Sort-Object CPU -Descending | Select-Object -First 7 ProcessName,Id,CPU,WS,Path | ConvertTo-Json -Compress', [], { silent: true }));
const defender = getJson('if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,QuickScanAge,FullScanAge,AntivirusSignatureLastUpdated | ConvertTo-Json -Compress }', { AntivirusEnabled: null, RealTimeProtectionEnabled: null }, { silent: true });
const firewall = arrayify(getJson('Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress', [], { silent: true }));
const importantServices = arrayify(getJson(`$names = @(${RULES.important_services.map(x => `'${x}'`).join(',')}); Get-Service | Where-Object { $names -contains $_.Name } | Select-Object Name,Status,StartType | ConvertTo-Json -Compress`, [], { silent: true }));
const scheduledTasks = arrayify(getJson(`$patterns = @(${RULES.important_tasks.map(x => `'${x}'`).join(',')}); Get-ScheduledTask | Where-Object { $name = $_.TaskName; foreach ($p in $patterns) { if ($name -like ('*' + $p + '*')) { return $true } }; return $false } | Select-Object TaskName,State,TaskPath | ConvertTo-Json -Compress`, [], { silent: true }));
const recentEvents = arrayify(getJson(`$start=(Get-Date).AddHours(-${CONFIG.monitoring.recent_event_hours}); try { Get-WinEvent -FilterHashtable @{LogName='System'; Level=2; StartTime=$start} -MaxEvents 15 | Select-Object TimeCreated,Id,ProviderName,LevelDisplayName,Message | ConvertTo-Json -Compress } catch { '[]' }`, [], { silent: true }));
const netPorts = arrayify(getJson(`Get-NetTCPConnection -State Listen | Where-Object { ${RULES.important_ports.map(p => '$_.LocalPort -eq ' + p).join(' -or ')} } | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress`, [], { silent: true }));
const gateways = CONFIG.openclaw.gateways.map(g => {
  const code = toNumber(runPs(`try { (Invoke-WebRequest -UseBasicParsing -Uri '${g.url}' -TimeoutSec 5).StatusCode } catch { if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 } }`, '0', { silent: true }));
  const port = Number(g.url.match(/:(\d+)\//)[1]);
  const listening = netPorts.some(p => Number(p.LocalPort) === port);
  return { name: g.name, url: g.url, port, statusCode: code, listening, ok: listening && code >= 200 && code < 500 };
});
const openclawTasks = arrayify(getJson(`$patterns = @(${CONFIG.openclaw.scheduled_task_patterns.map(x => `'${x}'`).join(',')}); Get-ScheduledTask | Where-Object { $name = $_.TaskName; foreach ($p in $patterns) { if ($name -like ('*' + $p + '*')) { return $true } }; return $false } | Select-Object TaskName,State,TaskPath | ConvertTo-Json -Compress`, [], { silent: true }));
const cronState = readOpenClawCronJobs();
const cronJobs = cronState.jobs;
const nodeFallbackHints = arrayify(getJson(`$base='${path.join(process.env.USERPROFILE || '', '.openclaw').replace(/\\/g, '\\\\')}'; if (Test-Path $base) { $files = Get-ChildItem -Path $base -Recurse -Include *.log,*.json -ErrorAction SilentlyContinue | Select-Object -First 60 FullName; $hits = foreach ($f in $files) { try { $m = Select-String -Path $f.FullName -Pattern 'fallback','model failed','provider failed' -SimpleMatch -ErrorAction SilentlyContinue; if ($m) { [pscustomobject]@{ File=$f.FullName; Count=$m.Count } } } catch {} }; $hits | ConvertTo-Json -Compress }`, [], { silent: true }));
const growthItems = [];
for (const scanRoot of CONFIG.monitoring.growth_scan_roots) {
  for (const pattern of CONFIG.monitoring.growth_scan_patterns) {
    const items = arrayify(getJson(`if (Test-Path '${scanRoot.replace(/\\/g, '\\\\')}') { Get-ChildItem -Path '${scanRoot.replace(/\\/g, '\\\\')}' -Directory -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*${pattern}*' } | Select-Object -First 10 FullName,@{n='SizeMB';e={[math]::Round((Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB,2)}} | ConvertTo-Json -Compress }`, [], { silent: true }));
    growthItems.push(...items.filter(Boolean));
  }
}

const checks = [];
checks.push({ name: 'CPU', value: cpuLoad, status: cpuLoad >= CONFIG.thresholds.cpu_critical ? 'CRITICAL' : cpuLoad >= CONFIG.thresholds.cpu_warning ? 'WARNING' : 'OK', summary: 'CPU ' + cpuLoad.toFixed(1) + '%' });
checks.push({ name: 'RAM', value: ramUsedPct, status: ramUsedPct >= CONFIG.thresholds.ram_critical ? 'CRITICAL' : ramUsedPct >= CONFIG.thresholds.ram_warning ? 'WARNING' : 'OK', summary: 'RAM ' + ramUsedPct.toFixed(1) + '%' });
for (const disk of disks) checks.push({ name: 'Disk ' + disk.DeviceID, value: disk.FreeGB, status: disk.FreeGB <= CONFIG.thresholds.disk_critical_free_gb ? 'CRITICAL' : disk.FreeGB <= CONFIG.thresholds.disk_warning_free_gb ? 'WARNING' : 'OK', summary: disk.DeviceID + ' free ' + disk.FreeGB + 'GB' });
checks.push({ name: 'Disk Activity', value: diskActivity, status: diskActivity >= CONFIG.thresholds.disk_activity_critical_pct ? 'CRITICAL' : diskActivity >= CONFIG.thresholds.disk_activity_warning_pct ? 'WARNING' : 'OK', summary: 'Disk activity ' + diskActivity.toFixed(1) + '%' });
checks.push({ name: 'Network Connectivity', value: pingResults, status: pingResults.every(x => x.ok) ? 'OK' : pingResults.some(x => x.ok) ? 'WARNING' : 'CRITICAL', summary: pingResults.filter(x => !x.ok).length ? 'Ping failed: ' + pingResults.filter(x => !x.ok).map(x => x.target).join(', ') : 'Ping OK' });
checks.push({ name: 'Internet Reachability', value: webResults, status: webResults.every(x => x.ok) ? 'OK' : webResults.some(x => x.ok) ? 'WARNING' : 'CRITICAL', summary: webResults.filter(x => !x.ok).length ? 'Internet failed: ' + webResults.filter(x => !x.ok).map(x => x.target).join(', ') : 'Internet OK' });
checks.push({ name: 'Windows Defender', value: defender, status: defender && defender.AntivirusEnabled && defender.RealTimeProtectionEnabled ? 'OK' : 'CRITICAL', summary: defender && defender.AntivirusEnabled && defender.RealTimeProtectionEnabled ? 'Defender OK' : 'Defender disabled' });
checks.push({ name: 'Firewall', value: firewall, status: firewall.length && firewall.every(x => x.Enabled) ? 'OK' : 'CRITICAL', summary: firewall.length && firewall.every(x => x.Enabled) ? 'Firewall OK' : 'Firewall profile disabled' });
checks.push({ name: 'Critical Events', value: recentEvents.length, status: recentEvents.length >= CONFIG.thresholds.event_error_critical ? 'CRITICAL' : recentEvents.length >= CONFIG.thresholds.event_error_warning ? 'WARNING' : 'OK', summary: recentEvents.length ? 'Critical events: ' + recentEvents.length : 'No recent critical events' });
checks.push({ name: 'Important Services', value: importantServices, status: importantServices.every(x => toNumber(x.Status, x.Status) === 4 || String(x.Status).toLowerCase() === 'running') ? 'OK' : 'WARNING', summary: importantServices.every(x => toNumber(x.Status, x.Status) === 4 || String(x.Status).toLowerCase() === 'running') ? 'Services OK' : 'Important service stopped' });
checks.push({ name: 'Important Tasks', value: scheduledTasks, status: scheduledTasks.length && scheduledTasks.every(x => String(x.State).toLowerCase() !== 'disabled') ? 'OK' : 'WARNING', summary: scheduledTasks.length ? 'Tasks found' : 'Tasks missing' });

for (const proc of topProcesses.slice(0, 7)) offenders.push({ name: proc.ProcessName, cpu: Math.round(toNumber(proc.CPU, 0) * 10) / 10, memoryMb: Math.round(toNumber(proc.WS, 0) / 1024 / 1024), path: proc.Path || '' });

const openclawChecks = [];
for (const gateway of gateways) openclawChecks.push({ name: gateway.name, value: gateway, status: gateway.ok ? 'OK' : gateway.listening ? 'WARNING' : 'CRITICAL', summary: gateway.name + ' port ' + gateway.port + ' ' + (gateway.ok ? 'OK' : gateway.listening ? 'no health' : 'down') });
openclawChecks.push({ name: 'OpenClaw Ports', value: netPorts, status: RULES.important_ports.every(p => netPorts.some(x => Number(x.LocalPort) === p)) ? 'OK' : 'CRITICAL', summary: 'Ports ' + RULES.important_ports.join(', ') });
openclawChecks.push({ name: 'OpenClaw Tasks', value: openclawTasks, status: openclawTasks.length && openclawTasks.every(x => {
  const state = String(x.State || '').toLowerCase();
  const numeric = toNumber(x.State, -1);
  return state !== 'disabled' && (state === 'ready' || state === 'running' || numeric === 1 || numeric === 3 || numeric === 4);
}) ? 'OK' : 'WARNING', summary: openclawTasks.length ? 'OpenClaw tasks found' : 'OpenClaw tasks missing' });
openclawChecks.push({ name: 'Cron Jobs', value: cronJobs, status: cronJobs.length ? 'OK' : 'WARNING', summary: cronJobs.length ? 'Cron jobs found: ' + cronJobs.length : 'No cron jobs found (' + cronState.source + ')' });
openclawChecks.push({ name: 'Fallback / Model failures', value: nodeFallbackHints, status: nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_critical ? 'CRITICAL' : nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_warning ? 'WARNING' : 'OK', summary: nodeFallbackHints.length ? 'Model fallback hints: ' + nodeFallbackHints.length : 'No model fallback hints' });
openclawChecks.push({ name: 'Growth scan', value: growthItems, status: growthItems.some(x => toNumber(x.SizeMB) >= CONFIG.thresholds.growth_critical_mb) ? 'CRITICAL' : growthItems.some(x => toNumber(x.SizeMB) >= CONFIG.thresholds.growth_warning_mb) ? 'WARNING' : 'OK', summary: growthItems.length ? 'Growth items: ' + growthItems.length : 'Growth normal' });

for (const item of checks.concat(openclawChecks)) if (item.status !== 'OK') addFailure(item.name, item.summary, item.value, item.status);

for (const svc of importantServices) {
  const running = toNumber(svc.Status, svc.Status) === 4 || String(svc.Status).toLowerCase() === 'running';
  if (!running && !isRecentFix('restart_service', svc.Name)) {
    const safe = RULES.safe_services.find(x => x.name === svc.Name && x.allow_restart);
    if (safe) addFix('restart_service', svc.Name, restartService(svc.Name) ? 'success' : 'failed', 'Service was ' + svc.Status);
  }
}
for (const task of openclawTasks) {
  if (isRecentFix('recover_openclaw_task', task.TaskName, 30)) continue;
  const recovery = safeRecoverOpenClawTask(task.TaskName, task.State);
  if (recovery.attempted) addFix('recover_openclaw_task', task.TaskName, recovery.result, recovery.details);
}
if (nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_critical) {
  const fallbackModel = CONFIG.openclaw.safe_fallback_models[0];
  const fallbackState = { updated_at: now, active_model: fallbackModel, reason: 'repeated model failure hint', mode: 'config-override' };
  writeJson(path.join(ROOT, 'state', 'fallback-model.json'), fallbackState);
  addFix('fallback_model', fallbackModel, 'success', 'Fallback state updated');
}
const groupedFailures = {};
for (const f of (previousState.recent_failures || []).concat(failures)) groupedFailures[f.kind] = (groupedFailures[f.kind] || 0) + 1;
for (const [kind, count] of Object.entries(groupedFailures)) {
  if (count >= CONFIG.thresholds.failure_repeat_critical) {
    const matchingJob = cronJobs.find(x => String(x.name || x.id || x.jobId || '').toLowerCase().includes(kind.toLowerCase()));
    if (matchingJob && RULES.safe_cron_disable_patterns.some(p => String(matchingJob.name || matchingJob.id || matchingJob.jobId || '').toLowerCase().includes(p.toLowerCase())) && !isRecentFix('disable_repeating_cron', matchingJob.jobId || matchingJob.id || matchingJob.name, 120)) {
      const disableResult = disableCronJob(String(matchingJob.jobId || matchingJob.id || matchingJob.name));
      addFix('disable_repeating_cron', matchingJob.jobId || matchingJob.id || matchingJob.name, disableResult.ok ? 'success' : 'failed', disableResult.details);
    }
  }
}
for (const proc of topProcesses) {
  const memMb = Math.round(toNumber(proc.WS, 0) / 1024 / 1024);
  const safe = RULES.safe_kill_processes.find(x => x.name.toLowerCase() === String(proc.ProcessName || '').toLowerCase() && (!x.path_contains || x.path_contains.some(token => String(proc.Path || '').toLowerCase().includes(token.toLowerCase()))));
  if (safe && memMb >= 4096 && !isRecentFix('stop_runaway_process', proc.ProcessName + '#' + proc.Id)) addFix('stop_runaway_process', proc.ProcessName + '#' + proc.Id, stopProcess(proc.Id) ? 'success' : 'failed', 'Memory ' + memMb + 'MB');
}
for (const cleanupRule of RULES.safe_cleanup_paths) {
  if (isRecentFix('cleanup_safe_path', cleanupRule.path, 720)) continue;
  const deleted = cleanupOldFiles(cleanupRule, cleanupRule.path.toLowerCase().includes('log') ? CONFIG.thresholds.old_log_days : CONFIG.thresholds.old_temp_days);
  if (deleted.length) addFix('cleanup_safe_path', cleanupRule.path, 'success', 'Deleted files: ' + deleted.length);
}
const runawayBackups = topProcesses.filter(x => /backup/i.test(String(x.ProcessName)) && toNumber(x.CPU, 0) > CONFIG.thresholds.runaway_backup_minutes);
for (const proc of runawayBackups) {
  const safe = RULES.safe_kill_processes.find(x => x.name.toLowerCase() === String(proc.ProcessName || '').toLowerCase());
  if (safe && !isRecentFix('stop_runaway_backup', proc.ProcessName + '#' + proc.Id)) addFix('stop_runaway_backup', proc.ProcessName + '#' + proc.Id, stopProcess(proc.Id) ? 'success' : 'failed', 'High CPU backup process');
}

const computerStatus = pickStatus(checks);
const openclawStatus = pickStatus(openclawChecks);
const overallStatus = pickStatus([{ status: computerStatus }, { status: openclawStatus }]);
const recentFailures = truncateArray(failures.concat(previousState.recent_failures || []), CONFIG.monitoring.max_dashboard_failures);
const recentFixes = truncateArray(fixes.concat(previousState.last_fixes || []), 20);
const alert = computeAlert(overallStatus, recentFailures, { pingResults, webResults, recentEvents, cronSource: cronState.source, gateways, openclawTasks });
let alertDelivery = previousState.alerts?.last_delivery || { sent: false, mode: 'none' };
if (alert.shouldSend) {
  alertDelivery = sendTelegramAlert(alert);
  writeAlertFile(alert, alertDelivery);
  persistAlert(alert, alertDelivery);
}

const dashboardData = {
  system_name: CONFIG.system_name,
  generated_at: now,
  overall_status: overallStatus,
  computer_status: computerStatus,
  openclaw_status: openclawStatus,
  computer_checks: checks,
  openclaw_checks: openclawChecks,
  recent_failures: recentFailures,
  last_fixes: recentFixes,
  top_offenders: offenders,
  gateways,
  scheduled_tasks: openclawTasks,
  services: importantServices,
  recent_events: recentEvents.slice(0, 10),
  cron_jobs: cronJobs,
  cron_source: cronState.source,
  insights: alert.enrichedIssues || [],
  alerts: {
    configured: true,
    last_message: alert.shouldSend ? formatAlert(alert) : previousState.alerts?.last_summary || null,
    last_status: previousState.alerts?.last_status || alert.status,
    last_delivery: previousState.alerts?.last_delivery || alertDelivery
  }
};
writeJson(DASHBOARD_DATA_PATH, dashboardData);
writeJson(STATE_PATH, {
  system_name: CONFIG.system_name,
  version: CONFIG.version,
  last_check: now,
  overall_status: overallStatus,
  computer_health: { status: computerStatus, issues: summarizeIssues(checks) },
  openclaw_health: { status: openclawStatus, issues: summarizeIssues(openclawChecks) },
  recent_failures: recentFailures,
  last_fixes: recentFixes,
  top_offenders: offenders,
  alerts: previousState.alerts
});
appendLog('Overall status: ' + overallStatus);
appendLog('Computer status: ' + computerStatus);
appendLog('OpenClaw status: ' + openclawStatus);
appendLog('Cron source: ' + cronState.source);
if (alert.shouldSend) appendLog('Alert delivery: ' + JSON.stringify(alertDelivery));
for (const fix of fixes) appendLog('Fix ' + fix.type + ' target=' + fix.target + ' result=' + fix.result);
writeLog();
require('./render-dashboard');
const publishResult = publishDashboard(DASHBOARD_DATA_PATH, DASHBOARD_FILE_PATH);
if (publishResult.ok) appendLog('Dashboard publish OK: ' + JSON.stringify(publishResult));
console.log(JSON.stringify({ status: overallStatus, dashboard: path.relative(ROOT, DASHBOARD_FILE_PATH), failures: failures.length, fixes: fixes.length, dryRun: IS_DRY_RUN, alertPrepared: alert.shouldSend, alertDelivery, cronSource: cronState.source, publish: publishResult }, null, 2));
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = readJson(path.join(ROOT, 'config', 'config.json'));
const RULES = readJson(path.join(ROOT, 'config', 'rules.json'));
const SECRETS = readOptionalJson(path.join(ROOT, CONFIG.paths.secrets_file || 'config/secrets.local.json'));
const STATE_PATH = path.join(ROOT, CONFIG.paths.state_file);
const DASHBOARD_DATA_PATH = path.join(ROOT, CONFIG.paths.dashboard_data_file);
const DASHBOARD_FILE_PATH = path.join(ROOT, CONFIG.paths.dashboard_file);
const LOG_DIR = path.join(ROOT, CONFIG.paths.log_dir);
const IS_DRY_RUN = process.argv.includes('--dry-run');
const previousState = fs.existsSync(STATE_PATH) ? readJson(STATE_PATH) : { recent_failures: [], last_fixes: [], alerts: {} };
const now = new Date().toISOString();
const logLines = [];
const failures = [];
const offenders = [];

ensureDir(path.dirname(STATE_PATH));
ensureDir(path.dirname(DASHBOARD_DATA_PATH));
ensureDir(LOG_DIR);

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function readOptionalJson(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }
function appendLog(line) { logLines.push('[' + new Date().toISOString() + '] ' + line); }
function toNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function arrayify(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function truncateArray(arr, max) { return arr.slice(0, max); }
function severityRank(status) { return status === 'CRITICAL' ? 3 : status === 'WARNING' ? 2 : status === 'OK' ? 1 : 0; }
function pickStatus(items) {
  let status = 'OK';
  for (const item of items) if (severityRank(item.status) > severityRank(status)) status = item.status;
  return status;
}
function summarizeIssues(items) { return items.filter(x => x.status !== 'OK').map(x => x.summary); }
function addFailure(kind, summary, details, statusHint = null) { failures.push({ time: now, kind, summary, details, status: statusHint }); }
function runPs(command, fallback = null, options = {}) {
  try {
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeoutMs || 15000,
      windowsHide: true
    });
    return out.trim();
  } catch (error) {
    if (!options.silent) appendLog('PowerShell failed: ' + error.message);
    return fallback;
  }
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
function isInfoInternetTarget(summary) {
  return (RULES.classification?.internet_info_targets || []).some(target => summary.includes(target));
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

  if (kind === 'Internet Reachability' && isInfoInternetTarget(summary)) {
    return {
      severity: 'INFO',
      confidence: 'low',
      impact: 'כנראה מדובר ביעד בדיקה משני שלא נגיש, לא בתקלה כללית בחיבור',
      next: 'להשאיר בדשבורד בלבד, ללא התראה'
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
  if (kind === 'Critical Events') {
    return {
      severity: issue.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      confidence: providers.length ? 'high' : 'medium',
      impact: hasWifiSignal ? 'יש סימנים לתקלה ברכיב רשת, מה שעלול להשפיע על קישוריות ויציבות' : 'נרשמו שגיאות מערכת עם פוטנציאל להשפעה תפעולית',
      next: 'לבדוק את רצף ה-Event Viewer סביב ' + (providers.slice(0, 3).join(', ') || 'הרכיב הבעייתי')
    };
  }
  if (kind === 'OpenClaw Ports' && context.missingGatewayNames?.length) {
    return {
      severity: 'INFO',
      confidence: 'high',
      impact: 'זו כנראה תוצאה נגזרת של gateway חסר, לא תקלה נפרדת',
      next: 'להתמקד ב-gateway החסר ולא בפורטים עצמם'
    };
  }
  if (/gateway/i.test(kind) || /OpenClaw/i.test(kind)) {
    const confidence = gatewayCount && healthyGateways < gatewayCount ? 'high' : openclawTaskCount && runningOpenclawTasks < openclawTaskCount ? 'high' : 'medium';
    return {
      severity: issue.status === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      confidence,
      impact: 'עשוי להשפיע ישירות על זמינות OpenClaw או routing פנימי',
      next: 'לבדוק ידנית את הרכיב אם המצב נשאר לא תקין'
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
function formatAlert(alert) {
  return alert.message || (alert.status === 'CRITICAL'
    ? CONFIG.alerts.critical_template.replace('{summary}', alert.summary)
    : alert.status === 'WARNING'
      ? CONFIG.alerts.warning_template.replace('{summary}', alert.summary)
      : CONFIG.alerts.normal_template);
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
function getTelegramConfig() {
  const cfg = CONFIG.alerts?.telegram || {};
  const secretCfg = SECRETS.alerts?.telegram || {};
  return {
    bot_token: process.env.PC_GUARDIAN_TELEGRAM_BOT_TOKEN || secretCfg.bot_token || cfg.bot_token || '',
    chat_id: process.env.PC_GUARDIAN_TELEGRAM_CHAT_ID || secretCfg.chat_id || cfg.chat_id || '',
    silent: !!cfg.silent
  };
}
function sendTelegramAlert(alert) {
  const telegram = getTelegramConfig();
  if (!telegram.bot_token || !telegram.chat_id) return Promise.resolve({ sent: false, mode: 'disabled', reason: 'telegram_not_configured' });
  if (IS_DRY_RUN) return Promise.resolve({ sent: true, mode: 'dry-run', reason: 'dry_run' });

  const payload = JSON.stringify({
    chat_id: telegram.chat_id,
    text: formatAlert(alert),
    disable_notification: !!telegram.silent
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${telegram.bot_token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ sent: !!parsed.ok, mode: 'telegram', response: parsed });
        } catch {
          resolve({ sent: false, mode: 'telegram', reason: 'invalid json response' });
        }
      });
    });

    req.on('error', (error) => {
      appendLog('Telegram alert failed: ' + error.message);
      resolve({ sent: false, mode: 'telegram', reason: error.message });
    });

    req.write(payload, 'utf8');
    req.end();
  });
}
function writeLog() {
  const file = path.join(LOG_DIR, 'pc-guardian.log');
  const prior = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const merged = prior.concat(logLines).slice(-CONFIG.monitoring.max_log_lines);
  fs.writeFileSync(file, merged.join(os.EOL) + os.EOL, 'utf8');
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
function runValidation() {
  execFileSync('node', ['scripts/validate-config.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true });
}

async function main() {
  runValidation();
  appendLog('Mode: reporting-only monitoring');
  appendLog('Automatic actions are disabled by policy');

  const cpuLoad = toNumber(runPs('(Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples[0].CookedValue.ToString("F2")', '0', { silent: true }));
  const mem = getJson('$os = Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{ TotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2); FreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2) } | ConvertTo-Json -Compress', { TotalGB: 0, FreeGB: 0 }, { silent: true });
  const ramUsedPct = mem.TotalGB > 0 ? ((mem.TotalGB - mem.FreeGB) / mem.TotalGB) * 100 : 0;
  const disks = arrayify(getJson('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{n="FreeGB";e={[math]::Round($_.FreeSpace/1GB,2)}},@{n="SizeGB";e={[math]::Round($_.Size/1GB,2)}} | ConvertTo-Json -Compress', [], { silent: true }));
  const diskActivity = toNumber(runPs('(Get-Counter "\\PhysicalDisk(_Total)\\% Disk Time").CounterSamples[0].CookedValue.ToString("F2")', '0', { silent: true }));
  const pingResults = CONFIG.monitoring.connectivity_targets.map(target => ({ target, ok: /True/i.test(runPs('Test-Connection -ComputerName "' + target + '" -Count 1 -Quiet', 'False', { silent: true }) || 'False') }));
  const internetTargets = arrayify(CONFIG.monitoring.internet_targets).map(target => typeof target === 'string' ? { url: target, severity: 'warning', label: target } : target);
  const webResults = internetTargets.map(target => ({
    url: target.url,
    severity: target.severity || 'warning',
    label: target.label || target.url,
    ok: /^(200|204)$/i.test(String(runPs('try { (Invoke-WebRequest -UseBasicParsing -Uri "' + target.url + '" -TimeoutSec 5).StatusCode } catch { 0 }', '0', { silent: true })))
  }));
  const topProcesses = arrayify(getJson('Get-Process | Sort-Object CPU -Descending | Select-Object -First 7 ProcessName,Id,CPU,WS,Path | ConvertTo-Json -Compress', [], { silent: true }));
  const defender = getJson('if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,QuickScanAge,FullScanAge,AntivirusSignatureLastUpdated | ConvertTo-Json -Compress }', { AntivirusEnabled: null, RealTimeProtectionEnabled: null }, { silent: true });
  const firewall = arrayify(getJson('Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress', [], { silent: true }));
  const importantServices = arrayify(getJson(`$names = @(${RULES.important_services.map(x => `'${x}'`).join(',')}); Get-Service | Where-Object { $names -contains $_.Name } | Select-Object Name,Status,StartType | ConvertTo-Json -Compress`, [], { silent: true }));
  const scheduledTasks = arrayify(getJson(`$patterns = @(${RULES.important_tasks.map(x => `'${x}'`).join(',')}); Get-ScheduledTask | Where-Object { $name = $_.TaskName; foreach ($p in $patterns) { if ($name -like ('*' + $p + '*')) { return $true } }; return $false } | Select-Object TaskName,State,TaskPath | ConvertTo-Json -Compress`, [], { silent: true }));
  const recentEvents = arrayify(getJson(`$start=(Get-Date).AddHours(-${CONFIG.monitoring.recent_event_hours}); try { Get-WinEvent -FilterHashtable @{LogName='System'; Level=2; StartTime=$start} -MaxEvents 15 | Select-Object TimeCreated,Id,ProviderName,LevelDisplayName,Message | ConvertTo-Json -Compress } catch { '[]' }`, [], { silent: true }));
  const netPorts = arrayify(getJson(`Get-NetTCPConnection -State Listen | Where-Object { ${RULES.important_ports.map(p => '$_.LocalPort -eq ' + p).join(' -or ')} } | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress`, [], { silent: true }));
  const gateways = CONFIG.openclaw.gateways.map(g => {
    const code = toNumber(runPs(`try { (Invoke-WebRequest -UseBasicParsing -Uri '${g.url}' -TimeoutSec 5).StatusCode } catch { if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 } }`, '0', { silent: true }));
    const match = g.url.match(/:(\d+)\//);
    const port = match ? Number(match[1]) : 0;
    const listening = netPorts.some(p => Number(p.LocalPort) === port);
    return { name: g.name, url: g.url, port, required: g.required !== false, statusCode: code, listening, ok: listening && code >= 200 && code < 500 };
  });
  const missingGatewayNames = gateways.filter(g => g.required !== false && !g.ok).map(g => g.name);
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
  const warningInternetFailures = webResults.filter(x => !x.ok && (x.severity || 'warning') !== 'info');
  const infoInternetFailures = webResults.filter(x => !x.ok && (x.severity || 'warning') === 'info');
  const internetStatus = warningInternetFailures.length ? (warningInternetFailures.length === webResults.length ? 'CRITICAL' : 'WARNING') : 'OK';
  const internetSummary = warningInternetFailures.length
    ? 'Internet failed: ' + warningInternetFailures.map(x => x.url).join(', ')
    : infoInternetFailures.length
      ? 'Internet optional target failed: ' + infoInternetFailures.map(x => x.url).join(', ')
      : 'Internet OK';
  checks.push({ name: 'Internet Reachability', value: webResults, status: internetStatus, summary: internetSummary });
  checks.push({ name: 'Windows Defender', value: defender, status: defender && defender.AntivirusEnabled && defender.RealTimeProtectionEnabled ? 'OK' : 'CRITICAL', summary: defender && defender.AntivirusEnabled && defender.RealTimeProtectionEnabled ? 'Defender OK' : 'Defender disabled' });
  checks.push({ name: 'Firewall', value: firewall, status: firewall.length && firewall.every(x => x.Enabled) ? 'OK' : 'CRITICAL', summary: firewall.length && firewall.every(x => x.Enabled) ? 'Firewall OK' : 'Firewall profile disabled' });
  checks.push({ name: 'Critical Events', value: recentEvents.length, status: recentEvents.length >= CONFIG.thresholds.event_error_critical ? 'CRITICAL' : recentEvents.length >= CONFIG.thresholds.event_error_warning ? 'WARNING' : 'OK', summary: recentEvents.length ? 'Critical events: ' + recentEvents.length : 'No recent critical events' });
  checks.push({ name: 'Important Services', value: importantServices, status: importantServices.every(x => toNumber(x.Status, x.Status) === 4 || String(x.Status).toLowerCase() === 'running') ? 'OK' : 'WARNING', summary: importantServices.every(x => toNumber(x.Status, x.Status) === 4 || String(x.Status).toLowerCase() === 'running') ? 'Services OK' : 'Important service stopped' });
  checks.push({ name: 'Important Tasks', value: scheduledTasks, status: scheduledTasks.length && scheduledTasks.every(x => String(x.State).toLowerCase() !== 'disabled') ? 'OK' : 'WARNING', summary: scheduledTasks.length ? 'Tasks found' : 'Tasks missing' });

  for (const proc of topProcesses.slice(0, 7)) offenders.push({ name: proc.ProcessName, cpu: Math.round(toNumber(proc.CPU, 0) * 10) / 10, memoryMb: Math.round(toNumber(proc.WS, 0) / 1024 / 1024), path: proc.Path || '' });

  const openclawChecks = [];
  for (const gateway of gateways) {
    const status = gateway.ok ? 'OK' : gateway.required !== false ? (gateway.listening ? 'WARNING' : 'CRITICAL') : 'WARNING';
    openclawChecks.push({ name: gateway.name, value: gateway, status, summary: gateway.name + ' port ' + gateway.port + ' ' + (gateway.ok ? 'OK' : gateway.listening ? 'no health' : 'down') });
  }
  const missingRequiredPorts = RULES.important_ports.filter(p => !netPorts.some(x => Number(x.LocalPort) === p));
  const portsStatus = missingRequiredPorts.length ? (missingGatewayNames.length ? 'WARNING' : 'CRITICAL') : 'OK';
  openclawChecks.push({ name: 'OpenClaw Ports', value: netPorts, status: portsStatus, summary: missingRequiredPorts.length ? 'Ports missing: ' + missingRequiredPorts.join(', ') : 'Ports ' + RULES.important_ports.join(', ') + ' OK' });
  openclawChecks.push({ name: 'OpenClaw Tasks', value: openclawTasks, status: openclawTasks.length && openclawTasks.every(x => {
    const state = String(x.State || '').toLowerCase();
    const numeric = toNumber(x.State, -1);
    return state !== 'disabled' && (state === 'ready' || state === 'running' || numeric === 1 || numeric === 3 || numeric === 4);
  }) ? 'OK' : 'WARNING', summary: openclawTasks.length ? 'OpenClaw tasks found' : 'OpenClaw tasks missing' });
  openclawChecks.push({ name: 'Cron Jobs', value: cronJobs, status: cronState.source === 'unavailable' ? 'OK' : cronJobs.length ? 'OK' : 'WARNING', summary: cronJobs.length ? 'Cron jobs found: ' + cronJobs.length : 'No cron jobs found (' + cronState.source + ')' });
  openclawChecks.push({ name: 'Fallback / Model failures', value: nodeFallbackHints, status: nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_critical ? 'CRITICAL' : nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_warning ? 'WARNING' : 'OK', summary: nodeFallbackHints.length ? 'Model fallback hints: ' + nodeFallbackHints.length : 'No model fallback hints' });
  openclawChecks.push({ name: 'Growth scan', value: growthItems, status: growthItems.some(x => toNumber(x.SizeMB) >= CONFIG.thresholds.growth_critical_mb) ? 'CRITICAL' : growthItems.some(x => toNumber(x.SizeMB) >= CONFIG.thresholds.growth_warning_mb) ? 'WARNING' : 'OK', summary: growthItems.length ? 'Growth items: ' + growthItems.length : 'Growth normal' });

  for (const item of checks.concat(openclawChecks)) {
    if (item.status !== 'OK') addFailure(item.name, item.summary, item.value, item.status);
  }

  const computerStatus = pickStatus(checks);
  const openclawStatus = pickStatus(openclawChecks);
  const overallStatus = pickStatus([{ status: computerStatus }, { status: openclawStatus }]);
  const recentFailures = truncateArray(failures.concat(previousState.recent_failures || []), CONFIG.monitoring.max_dashboard_failures);
  const alert = computeAlert(overallStatus, recentFailures, { pingResults, webResults, recentEvents, cronSource: cronState.source, gateways, openclawTasks, missingGatewayNames });
  let alertDelivery = previousState.alerts?.last_delivery || { sent: false, mode: 'none' };

  if (alert.shouldSend) {
    alertDelivery = await sendTelegramAlert(alert);
    writeAlertFile(alert, alertDelivery);
    persistAlert(alert, alertDelivery);
  }

  const dashboardData = {
    system_name: CONFIG.system_name,
    generated_at: now,
    overall_status: overallStatus,
    mode: 'reporting-only',
    policy: RULES.policy,
    computer_status: computerStatus,
    openclaw_status: openclawStatus,
    computer_checks: checks,
    openclaw_checks: openclawChecks,
    recent_failures: recentFailures,
    last_fixes: [],
    top_offenders: offenders,
    gateways,
    scheduled_tasks: openclawTasks,
    services: importantServices,
    recent_events: recentEvents.slice(0, 10),
    cron_jobs: cronJobs,
    cron_source: cronState.source,
    insights: alert.enrichedIssues || [],
    alerts: {
      configured: !!(getTelegramConfig().bot_token && getTelegramConfig().chat_id),
      last_message: alert.shouldSend ? formatAlert(alert) : previousState.alerts?.last_summary || null,
      last_status: previousState.alerts?.last_status || alert.status,
      last_delivery: alert.shouldSend ? alertDelivery : (previousState.alerts?.last_delivery || alertDelivery)
    }
  };

  writeJson(DASHBOARD_DATA_PATH, dashboardData);
  writeJson(STATE_PATH, {
    system_name: CONFIG.system_name,
    version: CONFIG.version,
    mode: 'reporting-only',
    last_check: now,
    overall_status: overallStatus,
    computer_health: { status: computerStatus, issues: summarizeIssues(checks) },
    openclaw_health: { status: openclawStatus, issues: summarizeIssues(openclawChecks) },
    recent_failures: recentFailures,
    last_fixes: [],
    top_offenders: offenders,
    alerts: previousState.alerts
  });

  appendLog('Overall status: ' + overallStatus);
  appendLog('Computer status: ' + computerStatus);
  appendLog('OpenClaw status: ' + openclawStatus);
  appendLog('Cron source: ' + cronState.source);
  appendLog('Telegram configured via ' + (SECRETS.alerts?.telegram?.bot_token ? 'secrets.local.json' : process.env.PC_GUARDIAN_TELEGRAM_BOT_TOKEN ? 'environment' : 'config/disabled'));
  if (alert.shouldSend) appendLog('Alert delivery: ' + JSON.stringify(alertDelivery));
  writeLog();

  require('./render-dashboard');
  const publishResult = publishDashboard(DASHBOARD_DATA_PATH, DASHBOARD_FILE_PATH);
  if (publishResult.ok) appendLog('Dashboard publish OK: ' + JSON.stringify(publishResult));

  console.log(JSON.stringify({
    status: overallStatus,
    mode: 'reporting-only',
    dashboard: path.relative(ROOT, DASHBOARD_FILE_PATH),
    failures: failures.length,
    fixes: 0,
    dryRun: IS_DRY_RUN,
    alertPrepared: alert.shouldSend,
    alertDelivery,
    cronSource: cronState.source,
    publish: publishResult
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

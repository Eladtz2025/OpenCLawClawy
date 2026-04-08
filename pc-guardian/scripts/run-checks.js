const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

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
function runPs(command, fallback = null) {
  try {
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim();
  } catch (error) {
    appendLog('PowerShell failed: ' + error.message);
    return fallback;
  }
}
function severityRank(status) { return status === 'CRITICAL' ? 3 : status === 'WARNING' ? 2 : status === 'OK' ? 1 : 0; }
function pickStatus(items) {
  let status = 'OK';
  for (const item of items) if (severityRank(item.status) > severityRank(status)) status = item.status;
  return status;
}
function summarizeIssues(items) { return items.filter(x => x.status !== 'OK').map(x => x.summary); }
function toNumber(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function arrayify(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function truncateArray(arr, max) { return arr.slice(0, max); }
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
function addFailure(kind, summary, details) { failures.push({ time: now, kind, summary, details }); }
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
  try { execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' }); return true; } catch { return false; }
}
function restartService(name) {
  if (IS_DRY_RUN) return true;
  return runPs("Restart-Service -Name '" + name.replace(/'/g, "''") + "' -Force", null) !== null;
}
function startTask(name) {
  if (IS_DRY_RUN) return true;
  try { execSync('schtasks /Run /TN "' + name.replace(/"/g, '""') + '"', { stdio: 'ignore' }); return true; } catch { return false; }
}
function disableTask(name) {
  if (IS_DRY_RUN) return true;
  try { execSync('schtasks /Change /TN "' + name.replace(/"/g, '""') + '" /Disable', { stdio: 'ignore' }); return true; } catch { return false; }
}
function getJson(command, fallback) {
  const out = runPs(command, null);
  if (!out) return fallback;
  try { return JSON.parse(out); } catch { return fallback; }
}

const cpuLoad = toNumber(runPs('(Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples[0].CookedValue.ToString("F2")', '0'));
const mem = getJson('$os = Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{ TotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2); FreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2) } | ConvertTo-Json -Compress', { TotalGB: 0, FreeGB: 0 });
const ramUsedPct = mem.TotalGB > 0 ? ((mem.TotalGB - mem.FreeGB) / mem.TotalGB) * 100 : 0;
const disks = arrayify(getJson('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{n="FreeGB";e={[math]::Round($_.FreeSpace/1GB,2)}},@{n="SizeGB";e={[math]::Round($_.Size/1GB,2)}} | ConvertTo-Json -Compress', []));
const diskActivity = toNumber(runPs('(Get-Counter "\\PhysicalDisk(_Total)\\% Disk Time").CounterSamples[0].CookedValue.ToString("F2")', '0'));
const pingResults = CONFIG.monitoring.connectivity_targets.map(target => ({ target, ok: /True/i.test(runPs('Test-Connection -ComputerName "' + target + '" -Count 1 -Quiet', 'False') || 'False') }));
const webResults = CONFIG.monitoring.internet_targets.map(target => ({ target, ok: /^(200|204)$/i.test(String(runPs('(Invoke-WebRequest -UseBasicParsing -Uri "' + target + '" -TimeoutSec 5).StatusCode', '0'))) }));
const topProcesses = arrayify(getJson('Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 ProcessName,Id,CPU,WS,Path | ConvertTo-Json -Compress', []));
const defender = getJson('if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,QuickScanAge,FullScanAge,AntivirusSignatureLastUpdated | ConvertTo-Json -Compress }', { AntivirusEnabled: null, RealTimeProtectionEnabled: null });
const firewall = arrayify(getJson('Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress', []));
const importantServices = arrayify(getJson(`$names = @(${RULES.important_services.map(x => `'${x}'`).join(',')}); Get-Service | Where-Object { $names -contains $_.Name } | Select-Object Name,Status,StartType | ConvertTo-Json -Compress`, []));
const scheduledTasks = arrayify(getJson(`$patterns = @(${RULES.important_tasks.map(x => `'${x}'`).join(',')}); Get-ScheduledTask | Where-Object { $name = $_.TaskName; foreach ($p in $patterns) { if ($name -like ('*' + $p + '*')) { return $true } }; return $false } | Select-Object TaskName,State,TaskPath | ConvertTo-Json -Compress`, []));
const recentEvents = arrayify(getJson(`$start=(Get-Date).AddHours(-${CONFIG.monitoring.recent_event_hours}); Get-WinEvent -FilterHashtable @{LogName='System'; Level=2; StartTime=$start} -MaxEvents 15 | Select-Object TimeCreated,Id,ProviderName,LevelDisplayName,Message | ConvertTo-Json -Compress`, []));
const netPorts = arrayify(getJson(`Get-NetTCPConnection -State Listen | Where-Object { ${RULES.important_ports.map(p => '$_.LocalPort -eq ' + p).join(' -or ')} } | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress`, []));
const gateways = CONFIG.openclaw.gateways.map(g => {
  const code = toNumber(runPs(`try { (Invoke-WebRequest -UseBasicParsing -Uri '${g.url}' -TimeoutSec 5).StatusCode } catch { if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 } }`, '0'));
  const port = Number(g.url.match(/:(\d+)\//)[1]);
  const listening = netPorts.some(p => Number(p.LocalPort) === port);
  return { name: g.name, url: g.url, port, statusCode: code, listening, ok: listening && code >= 200 && code < 500 };
});
const openclawTasks = arrayify(getJson(`$patterns = @(${CONFIG.openclaw.scheduled_task_patterns.map(x => `'${x}'`).join(',')}); Get-ScheduledTask | Where-Object { $name = $_.TaskName; foreach ($p in $patterns) { if ($name -like ('*' + $p + '*')) { return $true } }; return $false } | Select-Object TaskName,State,TaskPath | ConvertTo-Json -Compress`, []));
const cronJobs = arrayify(getJson(`$root='${ROOT.replace(/\\/g, '\\\\')}'; Get-ChildItem -Path $root -Recurse -Filter '*cron*.json' -ErrorAction SilentlyContinue | Select-Object -First 20 FullName,Length,LastWriteTime | ConvertTo-Json -Compress`, []));
const nodeFallbackHints = arrayify(getJson(`$base='${path.join(process.env.USERPROFILE || '', '.openclaw').replace(/\\/g, '\\\\')}'; if (Test-Path $base) { $files = Get-ChildItem -Path $base -Recurse -Include *.log,*.json -ErrorAction SilentlyContinue | Select-Object -First 30 FullName; $hits = foreach ($f in $files) { try { $m = Select-String -Path $f.FullName -Pattern 'fallback','model failed','provider failed' -SimpleMatch -ErrorAction SilentlyContinue; if ($m) { [pscustomobject]@{ File=$f.FullName; Count=$m.Count } } } catch {} }; $hits | ConvertTo-Json -Compress }`, []));
const growthItems = [];
for (const scanRoot of CONFIG.monitoring.growth_scan_roots) {
  for (const pattern of CONFIG.monitoring.growth_scan_patterns) {
    const items = arrayify(getJson(`if (Test-Path '${scanRoot.replace(/\\/g, '\\\\')}') { Get-ChildItem -Path '${scanRoot.replace(/\\/g, '\\\\')}' -Directory -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*${pattern}*' } | Select-Object -First 10 FullName,@{n='SizeMB';e={[math]::Round((Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB,2)}} | ConvertTo-Json -Compress }`, []));
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

for (const proc of topProcesses.slice(0, 5)) offenders.push({ name: proc.ProcessName, cpu: Math.round(toNumber(proc.CPU, 0) * 10) / 10, memoryMb: Math.round(toNumber(proc.WS, 0) / 1024 / 1024), path: proc.Path || '' });

const openclawChecks = [];
for (const gateway of gateways) openclawChecks.push({ name: gateway.name, value: gateway, status: gateway.ok ? 'OK' : gateway.listening ? 'WARNING' : 'CRITICAL', summary: gateway.name + ' port ' + gateway.port + ' ' + (gateway.ok ? 'OK' : gateway.listening ? 'no health' : 'down') });
openclawChecks.push({ name: 'OpenClaw Ports', value: netPorts, status: RULES.important_ports.every(p => netPorts.some(x => Number(x.LocalPort) === p)) ? 'OK' : 'CRITICAL', summary: 'Ports ' + RULES.important_ports.join(', ') });
openclawChecks.push({ name: 'OpenClaw Tasks', value: openclawTasks, status: openclawTasks.length && openclawTasks.every(x => String(x.State).toLowerCase() !== 'disabled') ? 'OK' : 'WARNING', summary: openclawTasks.length ? 'OpenClaw tasks found' : 'OpenClaw tasks missing' });
openclawChecks.push({ name: 'Cron Jobs', value: cronJobs, status: cronJobs.length ? 'OK' : 'WARNING', summary: cronJobs.length ? 'Cron artifacts found' : 'No cron artifacts found' });
openclawChecks.push({ name: 'Fallback / Model failures', value: nodeFallbackHints, status: nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_critical ? 'CRITICAL' : nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_warning ? 'WARNING' : 'OK', summary: nodeFallbackHints.length ? 'Model fallback hints: ' + nodeFallbackHints.length : 'No model fallback hints' });
openclawChecks.push({ name: 'Growth scan', value: growthItems, status: growthItems.some(x => toNumber(x.SizeMB) >= CONFIG.thresholds.growth_critical_mb) ? 'CRITICAL' : growthItems.some(x => toNumber(x.SizeMB) >= CONFIG.thresholds.growth_warning_mb) ? 'WARNING' : 'OK', summary: growthItems.length ? 'Growth items: ' + growthItems.length : 'Growth normal' });

for (const item of checks.concat(openclawChecks)) if (item.status !== 'OK') addFailure(item.name, item.summary, item.value);

for (const svc of importantServices) {
  const running = toNumber(svc.Status, svc.Status) === 4 || String(svc.Status).toLowerCase() === 'running';
  if (!running) {
    const safe = RULES.safe_services.find(x => x.name === svc.Name && x.allow_restart);
    if (safe) addFix('restart_service', svc.Name, restartService(svc.Name) ? 'success' : 'failed', 'Service was ' + svc.Status);
  }
}
for (const task of openclawTasks) {
  const state = String(task.State || '').toLowerCase();
  const numericState = toNumber(task.State, -1);
  const runnable = state === 'ready' || state === 'running' || numericState === 3 || numericState === 4;
  if (!runnable) addFix('restart_task', task.TaskName, startTask(task.TaskName) ? 'success' : 'failed', 'Task state was ' + task.State);
}
if (nodeFallbackHints.length >= CONFIG.thresholds.failure_repeat_critical) {
  writeJson(path.join(ROOT, 'state', 'fallback-model.json'), { updated_at: now, active_model: CONFIG.openclaw.safe_fallback_models[0], reason: 'repeated model failure hint' });
  addFix('fallback_model', CONFIG.openclaw.safe_fallback_models[0], 'success', 'Fallback marker updated');
}
const groupedFailures = {};
for (const f of (previousState.recent_failures || []).concat(failures)) groupedFailures[f.kind] = (groupedFailures[f.kind] || 0) + 1;
for (const [kind, count] of Object.entries(groupedFailures)) {
  if (count >= CONFIG.thresholds.failure_repeat_critical) {
    const matchingTask = cronJobs.find(x => String(x.FullName || '').toLowerCase().includes(kind.toLowerCase()));
    if (matchingTask) addFix('disable_repeating_cron', path.basename(matchingTask.FullName), disableTask(path.basename(matchingTask.FullName)) ? 'success' : 'failed', 'Repeated failures: ' + count);
  }
}
for (const proc of topProcesses) {
  const memMb = Math.round(toNumber(proc.WS, 0) / 1024 / 1024);
  const safe = RULES.safe_kill_processes.find(x => x.name.toLowerCase() === String(proc.ProcessName || '').toLowerCase() && (!x.path_contains || x.path_contains.some(token => String(proc.Path || '').toLowerCase().includes(token.toLowerCase()))));
  if (safe && memMb >= 4096) addFix('stop_runaway_process', proc.ProcessName + '#' + proc.Id, stopProcess(proc.Id) ? 'success' : 'failed', 'Memory ' + memMb + 'MB');
}
for (const cleanupRule of RULES.safe_cleanup_paths) {
  const deleted = cleanupOldFiles(cleanupRule, cleanupRule.path.toLowerCase().includes('log') ? CONFIG.thresholds.old_log_days : CONFIG.thresholds.old_temp_days);
  if (deleted.length) addFix('cleanup_safe_path', cleanupRule.path, 'success', 'Deleted files: ' + deleted.length);
}
const runawayBackups = topProcesses.filter(x => /backup/i.test(String(x.ProcessName)) && toNumber(x.CPU, 0) > CONFIG.thresholds.runaway_backup_minutes);
for (const proc of runawayBackups) {
  const safe = RULES.safe_kill_processes.find(x => x.name.toLowerCase() === String(proc.ProcessName || '').toLowerCase());
  if (safe) addFix('stop_runaway_backup', proc.ProcessName + '#' + proc.Id, stopProcess(proc.Id) ? 'success' : 'failed', 'High CPU backup process');
}

const computerStatus = pickStatus(checks);
const openclawStatus = pickStatus(openclawChecks);
const overallStatus = pickStatus([{ status: computerStatus }, { status: openclawStatus }]);
const recentFailures = truncateArray(failures.concat(previousState.recent_failures || []), CONFIG.monitoring.max_dashboard_failures);
const recentFixes = truncateArray(fixes.concat(previousState.last_fixes || []), 20);
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
  recent_events: recentEvents.slice(0, 10)
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
  alerts: previousState.alerts || {}
});
appendLog('Overall status: ' + overallStatus);
appendLog('Computer status: ' + computerStatus);
appendLog('OpenClaw status: ' + openclawStatus);
for (const fix of fixes) appendLog('Fix ' + fix.type + ' target=' + fix.target + ' result=' + fix.result);
writeLog();
require('./render-dashboard');
console.log(JSON.stringify({ status: overallStatus, dashboard: path.relative(ROOT, DASHBOARD_FILE_PATH), failures: failures.length, fixes: fixes.length, dryRun: IS_DRY_RUN }, null, 2));

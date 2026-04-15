const { execFileSync } = require('child_process');

function runPs(command, fallback = null, timeoutMs = 15000) {
  try {
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs
    }).trim();
  } catch (e) {
    console.log('FAIL', e.message);
    return fallback;
  }
}

console.time('cron');
const out = runPs("$cmd='C:\\Users\\Itzhak\\AppData\\Roaming\\npm\\openclaw.ps1'; if (Test-Path $cmd) { powershell -NoProfile -ExecutionPolicy Bypass -File $cmd cron list --json }", '', 25000);
console.timeEnd('cron');
console.log(String(out).slice(0, 1000));
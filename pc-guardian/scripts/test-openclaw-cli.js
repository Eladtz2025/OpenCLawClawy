const { spawnSync } = require('child_process');
const result = spawnSync('C:\\Users\\Itzhak\\AppData\\Roaming\\npm\\openclaw.cmd', ['help'], { encoding: 'utf8', timeout: 15000 });
console.log(JSON.stringify({ status: result.status, signal: result.signal, stdout: result.stdout?.slice(0,500), stderr: result.stderr?.slice(0,500), error: result.error?.message }, null, 2));

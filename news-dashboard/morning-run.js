const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const SUMMARY_PATH = path.join(ROOT, 'telegram-summary.txt');
const ALERT_PATH = path.join(ROOT, 'telegram-alert.txt');

function writeAlert(message) {
  fs.writeFileSync(ALERT_PATH, String(message || '').trim(), 'utf8');
}

function clearOutputs() {
  fs.writeFileSync(SUMMARY_PATH, '', 'utf8');
  fs.writeFileSync(ALERT_PATH, '', 'utf8');
}

function runStep(scriptName, { allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
    cwd: __dirname,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0 && !allowFailure) {
    console.error(`${scriptName} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
  return result;
}

clearOutputs();
runStep('live-pipeline.js');
runStep('render-dashboard.js');
runStep('build-sanity-check.js');

const publishResult = runStep('publish-pages.js', { allowFailure: true });
if (publishResult.status !== 0) {
  const fallbackMessage = 'Publish to origin/main failed';
  if (!fs.existsSync(ALERT_PATH) || !fs.readFileSync(ALERT_PATH, 'utf8').trim()) {
    writeAlert(fallbackMessage);
  }
  console.error('publish-pages.js failed with exit code ' + publishResult.status);
  process.exit(publishResult.status || 1);
}

runStep('verify-public-url.js');
runStep('verify-media-public.js');
console.log('Dashboard pipeline status: SUCCESS');

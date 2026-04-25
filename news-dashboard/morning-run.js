const { spawnSync } = require('child_process');
const path = require('path');

function runStep(scriptName) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName)], {
    cwd: __dirname,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`${scriptName} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

runStep('live-pipeline.js');
runStep('render-dashboard.js');
runStep('build-sanity-check.js');
runStep('verify-public-url.js');
console.log('Dashboard pipeline status: SUCCESS');

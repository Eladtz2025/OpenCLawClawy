require('./live-pipeline');
const { spawnSync } = require('child_process');
const path = require('path');

// After pipeline completes, run the renderer to update the HTML dashboard
const renderResult = spawnSync(process.execPath, [path.join(__dirname, 'render-dashboard.js')], {
  cwd: __dirname,
  encoding: 'utf8'
});

console.log('Dashboard render status:', renderResult.status === 0 ? 'SUCCESS' : 'FAILED');
if (renderResult.stderr) console.error('Render Error:', renderResult.stderr);

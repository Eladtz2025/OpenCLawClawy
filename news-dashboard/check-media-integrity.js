const fs = require('fs');
const path = require('path');
const html = fs.readFileSync('news-dashboard/live-site/2026-04-24.html', 'utf8');
const files = [...html.matchAll(/src="(\.\/assets\/media\/[^"]+)"/g)].map(m => m[1]);
const report = files.map(rel => ({
  rel,
  exists: fs.existsSync(path.join('news-dashboard/live-site', rel.replace(/^\.\//, '').replace(/\//g, path.sep)))
}));
console.log(JSON.stringify({
  total: report.length,
  missing: report.filter(x => !x.exists)
}, null, 2));

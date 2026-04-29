const fs = require('fs');
const html = fs.readFileSync('news-dashboard/live-site/2026-04-24.html', 'utf8');
const matches = [...html.matchAll(/src="(\.\/assets\/media\/[^"]+)"/g)].map(m => m[1]);
console.log(JSON.stringify({ count: matches.length, files: matches }, null, 2));

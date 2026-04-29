const fs = require('fs');
const html = fs.readFileSync('news-dashboard/live-site/2026-04-24.html', 'utf8');
console.log(JSON.stringify({
  hasDoubleSummary: html.includes('why-label'),
  hasCardText: html.includes('card-text'),
  hasToggle: html.includes('header-toggle'),
  hasHeaderMeta: html.includes('header-meta'),
  singleTextCount: (html.match(/class="card-text"/g) || []).length
}, null, 2));

const fs = require('fs');
const html = fs.readFileSync('news-dashboard/live-site/2026-04-24.html', 'utf8');
const bad = ['�','�?','A�','x?x','xTx','x~x'];
console.log(JSON.stringify({
  bad: bad.some(m => html.includes(m)),
  h2: html.includes('טכנולוגיה #2'),
  cards: (html.match(/<article class="card"/g) || []).length
}, null, 2));

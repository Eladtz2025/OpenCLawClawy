const fs = require('fs');
const txt = fs.readFileSync('news-dashboard/_public_now_check.html', 'utf8');
const bad = ['�','�?','A�','x?x','xTx','x~x'];
const section = txt.match(/<h2>טכנולוגיה #2<\/h2>[\s\S]*?<div class="grid">([\s\S]*?)<\/div>\s*<\/section>/);
const grid = section ? section[1] : '';
console.log(JSON.stringify({
  publicBuild: (txt.match(/build-\d+/) || [])[0] || '',
  publicUpdated: (txt.match(/updated \(ISO\): ([^<]+)/) || [])[1] || '',
  hasGoodHebrewTitle: txt.includes('חדשות הבוקר'),
  hasTech2Header: txt.includes('טכנולוגיה #2'),
  badMarkers: bad.filter(m => txt.includes(m)),
  technology2Cards: (grid.match(/<article class="card"/g) || []).length
}, null, 2));

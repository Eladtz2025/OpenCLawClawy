const fs = require('fs');
const txt = fs.readFileSync('news-dashboard/_public_ui_check.html', 'utf8');
console.log(JSON.stringify({
  build: (txt.match(/build-\d+/) || [])[0] || '',
  hasToggle: txt.includes('header-toggle'),
  hasHeaderMeta: txt.includes('header-meta'),
  hasCardText: txt.includes('card-text'),
  hasOldWhyLabel: txt.includes('why-label'),
  cards: (txt.match(/class="card-text"/g) || []).length
}, null, 2));

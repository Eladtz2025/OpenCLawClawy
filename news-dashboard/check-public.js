const fs = require('fs');
const txt = fs.readFileSync('news-dashboard/_public_check2.html', 'utf8');
console.log(JSON.stringify({
  h1: (txt.match(/<h1[^>]*>(.*?)<\/h1>/) || [])[1] || '',
  banner: (txt.match(/<div class="build-banner">(.*?)<\/div>/) || [])[1] || '',
  hasMedia: txt.includes('assets/media/'),
  hasBuild: txt.includes('build-1777046768481')
}, null, 2));

const fs = require('fs');
const state = JSON.parse(fs.readFileSync('news-dashboard/state.json', 'utf8'));
const html = fs.readFileSync('news-dashboard/live-site/2026-04-24.html', 'utf8');
console.log(JSON.stringify({
  lastPublishedAt: state.lastPublishedAt,
  buildId: state.buildId,
  banner: (html.match(/<div class="build-banner">(.*?)<\/div>/) || [])[1] || '',
  hasMedia: html.includes('assets/media/'),
  sampleHeb: (html.match(/<h2>(.*?)<\/h2>/) || [])[1] || ''
}, null, 2));

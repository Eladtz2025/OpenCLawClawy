const fs = require('fs');
const path = require('path');

const root = __dirname;
const templatePath = path.join(root, 'telegram-dashboard-template.html');
const inputPath = process.argv[2] || path.join(root, 'sample-data.json');
const outputPath = process.argv[3] || path.join(root, 'rendered-dashboard.html');

const esc = (s='') => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const tagClass = (value) => {
  if (!value) return 'tag';
  if (['כן','מאומת','לקרוא'].includes(value)) return 'tag green';
  if (['אולי','חלקית מאומת','לעקוב','בינונית'].includes(value)) return 'tag yellow';
  if (['לא','לא ברור','לדלג','גבוהה'].includes(value)) return 'tag red';
  return 'tag purple';
};

const topCard = (item) => `
<div class="top-card">
  <div class="tagrow">
    <span class="tag purple">${esc(item.category)}</span>
    <span class="${tagClass(item.worth)}">${esc(item.worth)}</span>
    <span class="${tagClass(item.certainty)}">${esc(item.certainty)}</span>
  </div>
  <h3>${esc(item.title)}</h3>
  <p>${esc(item.summary)}</p>
  <div class="meta"><span>${esc(item.source)}</span><span>פעולה: ${esc(item.action)}</span></div>
</div>`;

const storyCard = (item) => `
<div class="story">
  <div class="tagrow">
    <span class="tag purple">${esc(item.category)}</span>
    <span class="${tagClass(item.action)}">${esc(item.action)}</span>
    <span class="${tagClass(item.certainty)}">${esc(item.certainty)}</span>
  </div>
  <h3>${esc(item.title)}</h3>
  <p>${esc(item.summary)}</p>
  <div class="why"><strong>למה זה חשוב:</strong> ${esc(item.why)}</div>
  <div class="meta">
    <span>מקור: ${esc(item.source)}</span>
    <span>ניפוח: ${esc(item.hype)}</span>
    <span>שווה זמן: ${esc(item.worth)}</span>
  </div>
</div>`;

const fill = (tpl, map) => Object.entries(map).reduce((acc, [k,v]) => acc.replaceAll(`{{${k}}}`, v), tpl);

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const template = fs.readFileSync(templatePath, 'utf8');

const topStories = (data.topStories || []).slice(0,3).map(topCard).join('\n');
const mainA = (data.sections?.primary || []).map(storyCard).join('\n') || '<div class="story"><h3>אין עדכון משמעותי היום</h3><p>אין פריט מספיק חזק להיכנס לבלוק הזה.</p></div>';
const mainB = (data.sections?.secondary || []).map(storyCard).join('\n') || '<div class="story"><h3>אין עדכון משמעותי היום</h3><p>אין פריט מספיק חזק להיכנס לבלוק הזה.</p></div>';

const html = fill(template, {
  DAY_STATUS: esc(data.dayStatus || ''),
  UPDATED_AT: esc(data.updatedAt || ''),
  REVIEWED: esc(data.reviewed || ''),
  INCLUDED: esc(data.included || ''),
  WORTH_COUNT: esc(data.worthCount || ''),
  TECH_RADAR: esc(data.radar?.tech || 'אין עדכון משמעותי היום'),
  ISRAEL_RADAR: esc(data.radar?.israel || 'אין עדכון משמעותי היום'),
  CRYPTO_RADAR: esc(data.radar?.crypto || 'אין עדכון משמעותי היום'),
  HAPOEL_RADAR: esc(data.radar?.hapoel || 'אין עדכון משמעותי היום'),
  TOP_STORIES: topStories,
  MAIN_STORIES_A: mainA,
  MAIN_STORIES_B: mainB,
  SUMMARY_IMPORTANT: esc(data.summary?.important || ''),
  SUMMARY_HYPE: esc(data.summary?.hype || ''),
  SUMMARY_SKIP: esc(data.summary?.skip || '')
});

fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);

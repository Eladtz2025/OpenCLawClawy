const fs = require('fs');
const path = require('path');

const FINAL_PATH = path.join(__dirname, 'daily-final.json');
const LIVE_DIR = path.join(__dirname, 'live-site');
const ARCHIVE_DIR = path.join(LIVE_DIR, 'archive');
const TODAY = new Date().toISOString().slice(0, 10);

// Simple escape for HTML
function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The core rendering logic extracted from live-pipeline.js
function renderDashboard(items, meta) {
  const totalFailedSources = meta.topics ? meta.topics.reduce((sum, topic) => sum + (topic.sourcesFailed?.length || 0), 0) : 0;
  
  // Since we don't have a full TOPICS config here, we derive categories from items
  const categories = [...new Set(items.map(i => i.category))];
  
  const sectionHtml = categories.map(cat => {
    const itemsForTopic = items.filter(item => item.category === cat);
    const cards = itemsForTopic.map(item => `
      <article class="card" onclick="window.open('${escapeHtml(item.sourceUrl)}','_blank','noopener,noreferrer')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.open('${escapeHtml(item.sourceUrl)}','_blank','noopener,noreferrer')}">
        <div class="topline"><span class="tag">${escapeHtml(item.source)}</span><span class="tag">${escapeHtml(item.certainty)}</span><span class="tag">${escapeHtml(item.publishedLabel || item.publishedAt)}</span></div>
        <h3>${escapeHtml(item.summary)}</h3>
        <p class="why-label">למה זה חשוב</p>
        <p class="why-body">${escapeHtml(item.editorNote || '')}</p>
        <div class="bottom"><span>אימות ${escapeHtml(String(item.verificationCount))}</span></div>
      </article>
    `).join('');
    return `
      <section>
        <div class="section-head"><h2>${escapeHtml(cat)}</h2><span>${itemsForTopic.length}/5</span></div>
        <div class="grid">${cards}</div>
      </section>
    `;
  }).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Clawy News Live</title>
<style>
body{margin:0;background:#07111d;color:#eef4ff;font-family:Segoe UI,Arial,sans-serif}
main{max-width:1280px;margin:0 auto;padding:20px}
header{margin-bottom:18px;position:sticky;top:0;background:#07111df2;backdrop-filter:blur(8px);padding:8px 0 12px;z-index:5}
.topmeta{display:flex;gap:10px;flex-wrap:wrap;color:#9eb3cf;font-size:13px}
section{margin:22px 0}
.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.section-meta{font-size:13px;color:#9eb3cf;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:#0f1a2a;border:1px solid #1c3048;border-radius:18px;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer}
.card:hover{border-color:#315277;transform:translateY(-1px)}
.topline,.bottom{display:flex;gap:8px;flex-wrap:font-size:12px;color:#b7cae4}
.tag{background:#16263a;padding:4px 8px;border-radius:999px}
h3{margin:10px 0;font-size:18px;line-height:1.55;white-space:pre-line}
p{margin:8px 0;line-height:1.7;color:#dce7fb}
.why-label{margin-bottom:4px;font-size:12px;color:#9eb3cf}
.why-body{margin-top:0;white-space:pre-line}
a{color:#8fd3ff;text-decoration:none}
@media (max-width:700px){main{padding:14px}.grid{grid-template-columns:1fr 1fr;gap:10px}.card{padding:14px}h3{font-size:16px}}
@media (max-width:520px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<header>
<h1>חדשות הבוקר</h1>
<div class="topmeta"><span>updated: ${new Date().toISOString()}</span><span>status: MANUAL_UPDATE</span></div>
</header>
${sectionHtml}
</main>
</body>
</html>`;
}

function main() {
  const items = JSON.parse(fs.readFileSync(FINAL_PATH, 'utf8'));
  const html = renderDashboard(items, {});
  
  if (!fs.existsSync(LIVE_DIR)) fs.mkdirSync(LIVE_DIR, { recursive: true });
  fs.writeFileSync(path.join(LIVE_DIR, 'latest.html'), html, 'utf8');
  
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE_DIR, `${TODAY}.html`), html, 'utf8');
  
  console.log('Dashboard updated successfully.');
}

main();

const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const LIVE_DIR = path.join(OUT_DIR, 'live-site');
const ARCHIVE_DIR = path.join(LIVE_DIR, 'archive');
const FINAL_PATH = path.join(OUT_DIR, 'daily-final.json');
const STATE_PATH = path.join(OUT_DIR, 'state.json');
const ROOT_INDEX_PATH = path.join(OUT_DIR, '..', 'index.html');
const TODAY = new Date().toISOString().slice(0, 10);

const TOPIC_LABELS = {
  technology: 'טכנולוגיה',
  technology2: 'טכנולוגיה #2',
  israel: 'ישראל',
  crypto: 'קריפטו',
  hapoel: 'הפועל פתח תקווה'
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function renderDashboard(items, meta) {
  const totalFailedSources = meta.topics.reduce((sum, topic) => sum + (topic.sourcesFailed?.length || 0), 0);
  const grouped = Object.fromEntries(Object.entries(TOPIC_LABELS).map(([key, label]) => [key, items.filter(item => item.category === key)]));
  
  const sectionHtml = Object.entries(TOPIC_LABELS).map(([key, label]) => {
    const itemsForTopic = grouped[key] || [];
    const topicMeta = meta.topics.find(t => t.topic === key);
    const cards = itemsForTopic.map(item => {
      const editorNote = String(item.editorNote || '').trim();
      const syntheticTag = item.synthetic ? `<span class="tag tag-warn">synthetic</span>` : '';
      const syntheticMeta = item.synthetic ? `<span>synthetic source</span>` : '';
      return `
      <article class="card" onclick="window.open('${escapeHtml(item.sourceUrl)}','_blank','noopener,noreferrer')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.open('${escapeHtml(item.sourceUrl)}','_blank','noopener,noreferrer')}">
        <div class="topline"><span class="tag">${escapeHtml(item.source)}</span><span class="tag">${escapeHtml(item.certainty)}</span>${syntheticTag}<span class="tag">${escapeHtml(item.publishedLabel || item.publishedAt)}</span></div>
        <h3>${escapeHtml(item.summary)}</h3>
        ${editorNote ? `<p class="why-label">סיכום</p><p class="why-body">${escapeHtml(editorNote)}</p>` : ''}
        <div class="bottom"><span>אימות ${escapeHtml(String(item.verificationCount))}</span>${syntheticMeta}</div>
      </article>
    `;
    }).join('');
    return `
      <section>
        <div class="section-head"><h2>${escapeHtml(label)}</h2><span>${itemsForTopic.length}/5</span></div>
        <div class="section-meta">worked: ${topicMeta?.sourcesWorked.length || 0} · failed: ${topicMeta?.sourcesFailed.length || 0} · fallback: ${topicMeta?.fallbackActive ? 'yes' : 'no'} · editor: ${topicMeta?.editorApplied ? 'on' : 'fallback'}</div>
        <div class="grid">${cards}</div>
      </section>
    `;
  }).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Clawy News Live - ${TODAY}</title>
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
.topline,.bottom{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#b7cae4}
.tag{background:#16263a;padding:4px 8px;border-radius:999px}
.tag-warn{background:#51311a;color:#ffd7a8}
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
<h1>חדשות הבוקר - ${TODAY}</h1>
<div class="topmeta"><span>updated: ${escapeHtml(meta.lastUpdated)}</span><span>sources worked: ${escapeHtml(String(meta.sourcesWorkedCount))}</span><span>sources failed: ${escapeHtml(String(totalFailedSources))}</span><span>fallback: ${meta.fallbackActive ? 'yes' : 'no'}</span><span>status: ${escapeHtml(meta.status)}</span></div>
</header>
${sectionHtml}
</main>
</body>
</html>`;
}

function pruneArchives() {
  if (!fs.existsSync(ARCHIVE_DIR)) return;
  const archiveFiles = fs.readdirSync(ARCHIVE_DIR)
    .filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x))
    .sort()
    .reverse();
  for (const stale of archiveFiles.slice(7)) {
    fs.unlinkSync(path.join(ARCHIVE_DIR, stale));
  }
}

function renderArchiveIndex(archiveFiles) {
  const links = archiveFiles.map(file => `<li><a href="./${escapeHtml(file)}">${escapeHtml(file.replace('.html', ''))}</a></li>`).join('');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Clawy News Archive</title>
<style>
body{margin:0;background:#07111d;color:#eef4ff;font-family:Segoe UI,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px}
a{color:#8fd3ff;text-decoration:none}
li{margin:10px 0}
</style>
</head>
<body>
<main>
<h1>ארכיון חדשות</h1>
<ul>${links}</ul>
</main>
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(FINAL_PATH) || !fs.existsSync(STATE_PATH)) {
    console.error('Missing required files (daily-final.json or state.json).');
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(FINAL_PATH, 'utf8'));
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

  const meta = {
    lastUpdated: state.lastPublishedAt || new Date().toISOString(),
    sourcesWorkedCount: new Set(state.topics ? Object.values(state.topics).flatMap(t => t.sourcesWorked || []) : []).size,
    fallbackActive: state.topics ? Object.values(state.topics).some(t => t.fallbackActive) : false,
    status: items.length >= (Object.keys(TOPIC_LABELS).length * 5) ? 'SUCCESS' : 'PARTIAL',
    topics: Object.entries(state.topics || {}).map(([topic, data]) => ({ topic, ...data }))
  };

  const dashboard = renderDashboard(items, meta);
  
  if (!fs.existsSync(LIVE_DIR)) fs.mkdirSync(LIVE_DIR, { recursive: true });
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  // 1. Write the actual daily file (bypasses cache because name changes daily)
  const dailyFileName = `${TODAY}.html`;
  fs.writeFileSync(path.join(LIVE_DIR, dailyFileName), dashboard, 'utf8');

  // 2. Update latest.html to be a simple redirect to the daily file
  const latestHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0; url=./${dailyFileName}" /></head><body>Redirecting to ${dailyFileName}...</body></html>`;
  fs.writeFileSync(path.join(LIVE_DIR, 'latest.html'), latestHtml, 'utf8');

  // 3. Write to archive
  fs.writeFileSync(path.join(ARCHIVE_DIR, dailyFileName), dashboard, 'utf8');
  pruneArchives();
  const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x)).sort().reverse();
  fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.html'), renderArchiveIndex(archiveFiles), 'utf8');

  // 4. Update root index to point directly to the daily file
  const rootHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0; url=./news-dashboard/live-site/${dailyFileName}?v=${Date.now()}" /></head><body><a href="./news-dashboard/live-site/${dailyFileName}?v=${Date.now()}">Clawy News Live</a></body></html>`;
  fs.writeFileSync(ROOT_INDEX_PATH, rootHtml, 'utf8');

  console.log(JSON.stringify({ status: meta.status, items: items.length, dailyFile: dailyFileName }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

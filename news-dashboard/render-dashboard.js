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

function formatJerusalemTimestamp(isoValue) {
  const date = new Date(isoValue || Date.now());
  if (Number.isNaN(date.getTime())) return String(isoValue || '');
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function renderDashboard(items, meta) {
  const totalFailedSources = meta.topics.reduce((sum, topic) => sum + (topic.sourcesFailed?.length || 0), 0);
  const grouped = Object.fromEntries(Object.entries(TOPIC_LABELS).map(([key, label]) => [key, items.filter(item => item.category === key)]));
  const buildLabel = formatJerusalemTimestamp(meta.lastUpdated);
  
  const sectionHtml = Object.entries(TOPIC_LABELS).map(([key, label]) => {
    const itemsForTopic = grouped[key] || [];
    const topicMeta = meta.topics.find(t => t.topic === key);
    const cards = itemsForTopic.map(item => {
      const editorNote = String(item.editorNote || '').trim();
      const syntheticTag = item.synthetic ? `<span class="tag tag-warn">synthetic</span>` : '';
      const syntheticMeta = item.synthetic ? `<span>synthetic source</span>` : '';
      const mediaBadge = item.mediaType === 'video' ? `<span class="media-badge">וידאו</span>` : '';
      const primaryText = editorNote || item.summary || item.title || '';
      const mediaHtml = item.localMediaPath ? `<div class="media-wrap">${mediaBadge}<img class="card-media" src="${escapeHtml(item.localMediaPath)}" alt="${escapeHtml(primaryText)}" loading="lazy" /></div>` : '';
      return `
      <article class="card" onclick="window.open('${escapeHtml(item.sourceUrl)}','_blank','noopener,noreferrer')" role="link" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.open('${escapeHtml(item.sourceUrl)}','_blank','noopener,noreferrer')}">
        ${mediaHtml}
        <div class="topline"><span class="tag">${escapeHtml(item.source)}</span><span class="tag">${escapeHtml(item.certainty)}</span>${syntheticTag}<span class="tag">${escapeHtml(item.publishedLabel || item.publishedAt)}</span></div>
        <p class="card-text">${escapeHtml(primaryText)}</p>
        <div class="bottom"><span>אימות ${escapeHtml(String(item.verificationCount))}</span>${syntheticMeta}</div>
      </article>
    `;
    }).join('');
    const countLabel = topicMeta?.maxCount ? `${itemsForTopic.length}/${topicMeta.maxCount}` : `${itemsForTopic.length}`;
    const lowVolumeNote = topicMeta?.lowVolumeByDesign ? ' · volume: low by design' : '';
    return `
      <section>
        <div class="section-head"><h2>${escapeHtml(label)}</h2><span>${countLabel}</span></div>
        <div class="section-meta">worked: ${topicMeta?.sourcesWorked.length || 0} · failed: ${topicMeta?.sourcesFailed.length || 0} · fallback: ${topicMeta?.fallbackActive ? 'yes' : 'no'} · editor: ${topicMeta?.editorApplied ? 'on' : 'fallback'}${lowVolumeNote}</div>
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
body{margin:0;background:#f7f4ee;color:#1f2937;font-family:Segoe UI,Arial,sans-serif}
main{max-width:1280px;margin:0 auto;padding:20px}
header{margin-bottom:18px;position:sticky;top:0;background:rgba(247,244,238,.94);backdrop-filter:blur(8px);padding:8px 0 12px;z-index:5;border-bottom:1px solid #e5ddd1}
.header-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.header-title{margin:0;font-size:clamp(28px,4vw,56px);line-height:1.05;color:#1d2a35}
.header-toggle{display:none;border:1px solid #cdbfae;background:#fffaf2;color:#6b4f2a;border-radius:12px;padding:8px 10px;font-size:18px;cursor:pointer}
.header-meta{display:block}
.build-banner{display:inline-flex;align-items:center;gap:8px;background:#fffaf2;border:1px solid #d9c8b2;color:#6b4f2a;padding:8px 12px;border-radius:999px;font-size:13px;font-weight:600;margin:8px 0 10px}
.topmeta{display:flex;gap:10px;flex-wrap:wrap;color:#6b7280;font-size:13px}
section{margin:22px 0}
.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;color:#1d2a35}
.section-meta{font-size:13px;color:#7b8794;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:#fffdf8;border:1px solid #e7dccd;border-radius:18px;padding:16px;box-shadow:0 8px 24px rgba(83,63,33,.08);cursor:pointer;overflow:hidden}
.card:hover{border-color:#c8b08e;transform:translateY(-1px)}
.media-wrap{position:relative;margin:-16px -16px 12px -16px;background:#efe7da}
.card-media{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#ede4d6}
.media-badge{position:absolute;top:10px;left:10px;background:rgba(255,250,242,.92);color:#6b4f2a;padding:5px 8px;border-radius:999px;font-size:12px;border:1px solid rgba(107,79,42,.15)}
.topline,.bottom{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#7b8794}
.tag{background:#f3eadb;padding:4px 8px;border-radius:999px;color:#5f4b32}
.tag-warn{background:#fce8d5;color:#9a5b18}
.card-text{margin:10px 0;font-size:18px;line-height:1.65;white-space:pre-line;color:#1f2937}
p{margin:8px 0;line-height:1.7;color:#374151}
a{color:#8b5e34;text-decoration:none}
@media (max-width:700px){main{padding:14px}.grid{grid-template-columns:1fr 1fr;gap:10px}.card{padding:14px}.card-text{font-size:16px}}
@media (max-width:640px){.header-title{font-size:32px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.header-toggle{display:inline-flex;align-items:center;justify-content:center}.header-meta{display:none}.header-meta.open{display:block}.build-banner{display:flex;width:100%;justify-content:space-between;box-sizing:border-box}.topmeta{flex-direction:column;gap:6px}}
@media (max-width:520px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<header>
<div class="header-row">
<h1 class="header-title">חדשות הבוקר - ${TODAY}</h1>
<button class="header-toggle" type="button" aria-expanded="false" aria-controls="header-meta" onclick="const meta=document.getElementById('header-meta'); const open=meta.classList.toggle('open'); this.setAttribute('aria-expanded', open ? 'true' : 'false'); this.textContent = open ? '▴' : '▾';">▾</button>
</div>
<div id="header-meta" class="header-meta">
<div class="build-banner"><span>build updated: ${escapeHtml(buildLabel)}</span><span aria-hidden="true">&bull;</span><span>${escapeHtml(meta.buildId)}</span></div>
<div class="topmeta"><span>updated (ISO): ${escapeHtml(meta.lastUpdated)}</span><span>sources worked: ${escapeHtml(String(meta.sourcesWorkedCount))}</span><span>sources failed: ${escapeHtml(String(totalFailedSources))}</span><span>fallback: ${meta.fallbackActive ? 'yes' : 'no'}</span><span>status: ${escapeHtml(meta.status)}</span></div>
</div>
</header>
${sectionHtml}
</main>
</body>
</html>`;
}

const ARCHIVE_RETENTION_DAYS = 7;
const GUARANTEED_RECENT_DAYS = 3;

function pruneArchives() {
  if (!fs.existsSync(ARCHIVE_DIR)) return;
  const archiveFiles = fs.readdirSync(ARCHIVE_DIR)
    .filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x))
    .sort()
    .reverse();

  const keep = new Set(archiveFiles.slice(0, Math.max(ARCHIVE_RETENTION_DAYS, GUARANTEED_RECENT_DAYS)));
  for (const stale of archiveFiles) {
    if (keep.has(stale)) continue;
    fs.unlinkSync(path.join(ARCHIVE_DIR, stale));
  }
}

function renderArchiveIndex(archiveFiles) {
  const recent = archiveFiles.slice(0, GUARANTEED_RECENT_DAYS);
  const recentSet = new Set(recent);
  const links = archiveFiles.map(file => {
    const label = escapeHtml(file.replace('.html', ''));
    const badge = recentSet.has(file) ? ' <strong>(recent)</strong>' : '';
    return `<li><a href="./${escapeHtml(file)}">${label}</a>${badge}</li>`;
  }).join('');
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
.meta{color:#9eb3cf;font-size:14px;margin-bottom:16px}
</style>
</head>
<body>
<main>
<h1>ארכיון חדשות</h1>
<p class="meta">נשמרים תמיד לפחות שלושת הימים האחרונים, ובפועל עד ${ARCHIVE_RETENTION_DAYS} קבצים אחרונים.</p>
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
    buildId: state.buildId || `build-${Date.now()}`,
    sourcesWorkedCount: new Set(state.topics ? Object.values(state.topics).flatMap(t => t.sourcesWorked || []) : []).size,
    fallbackActive: state.topics ? Object.values(state.topics).some(t => t.fallbackActive) : false,
    status: state.status || 'PARTIAL',
    topics: Object.entries(state.topics || {}).map(([topic, data]) => ({ topic, ...data }))
  };

  const dashboard = renderDashboard(items, meta);
  
  if (!fs.existsSync(LIVE_DIR)) fs.mkdirSync(LIVE_DIR, { recursive: true });
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  // 1. Write the actual daily file (bypasses cache because name changes daily)
  const dailyFileName = `${TODAY}.html`;
  fs.writeFileSync(path.join(LIVE_DIR, dailyFileName), dashboard, 'utf8');

  // 2. Update latest.html to be a simple redirect to the daily file
  const cacheBust = meta.buildId || `build-${Date.now()}`;
  const latestHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0; url=./${dailyFileName}?v=${cacheBust}" /></head><body>Redirecting to ${dailyFileName}...</body></html>`;
  fs.writeFileSync(path.join(LIVE_DIR, 'latest.html'), latestHtml, 'utf8');

  // 3. Write to archive
  fs.writeFileSync(path.join(ARCHIVE_DIR, dailyFileName), dashboard, 'utf8');
  pruneArchives();
  const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x)).sort().reverse();
  fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.html'), renderArchiveIndex(archiveFiles), 'utf8');

  // 4. Keep the repository root untouched. Public entry is the explicit live-site URL.

  console.log(JSON.stringify({ status: meta.status, items: items.length, dailyFile: dailyFileName }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.join(__dirname, 'selected-candidates.with-fallback.json');
const outputPath = process.argv[3] || path.join(__dirname, 'site', 'latest.html');
const archiveDate = new Date().toISOString().slice(0,10);

const esc = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const groups = { technology: [], israel: [], crypto: [], hapoel: [] };
for (const item of items) groups[item.category]?.push(item);

function tagClass(v='') {
  if (['מאומת','כן','לקרוא'].includes(v)) return 'green';
  if (['חלקית מאומת','אולי','לעקוב','בינונית'].includes(v)) return 'yellow';
  if (['לא ברור','לא','לדלג','גבוהה'].includes(v)) return 'red';
  return 'purple';
}

function hebrewCategory(key){ return ({technology:'טכנולוגיה', israel:'ישראל', crypto:'קריפטו', hapoel:'הפועל פתח תקווה'})[key] || key; }

function card(item){
  const fallbackTag = item.fallbackMode === 'weekly' ? `<span class="tag purple">fallback שבועי</span>` : '';
  return `<article class="card"><div class="tagrow"><span class="tag blue">${esc(item.source)}</span><span class="tag ${tagClass(item.certainty)}">${esc(item.certainty||'חלקית מאומת')}</span><span class="tag ${tagClass(item.action)}">${esc(item.action||'לעקוב')}</span>${fallbackTag}</div><h3 class="h3">${esc(item.title)}</h3><div class="summary">${esc(item.summary||'')}</div><div class="why"><strong>למה זה חשוב:</strong> ${esc(item.why||'לא צוין')}</div><div class="meta"><span>ניפוח: ${esc(item.hype||'בינונית')}</span><span>שווה זמן: ${esc(item.worth||'אולי')}</span><span><a href="${esc(item.sourceUrl)}?v=${archiveDate}">קישור</a></span></div></article>`;
}

function section(key){
  const arr = groups[key] || [];
  const cards = arr.length ? arr.map(card).join('\n') : `<article class="card empty"><div class="tagrow"><span class="tag red">אין עדכון משמעותי</span></div><h3 class="h3">אין כרגע פריטים חזקים מספיק</h3><div class="summary">הקטגוריה נשארת ריקה עד שיהיה חומר שעובר את הרף.</div></article>`;
  const count = arr.length;
  return `<section class="section" id="${key}"><div class="section-head"><h2 class="h2">${hebrewCategory(key)}</h2><div class="hint">${count} כתבות כרגע · עד 5 נבחרות</div></div><div class="stories">${cards}</div></section>`;
}

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" /><meta http-equiv="Pragma" content="no-cache" /><meta http-equiv="Expires" content="0" /><title>Clawy News App</title><style>:root{--bg:#07111d;--bg2:#0b1627;--panel:rgba(14,24,40,.92);--line:rgba(129,159,214,.14);--text:#eef4ff;--muted:#9eb3d8;--soft:#d7e2f6;--green:#22c983;--yellow:#ffbf69;--red:#ff7878;--blue:#4da3ff;--purple:#7d5cff;--shadow:0 18px 60px rgba(0,0,0,.28)}*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:radial-gradient(circle at top right, rgba(125,92,255,.18), transparent 24%),radial-gradient(circle at top left, rgba(77,163,255,.12), transparent 24%),linear-gradient(180deg,var(--bg2),var(--bg));color:var(--text)}.app{max-width:1120px;margin:0 auto;padding:16px}.topbar{position:sticky;top:0;z-index:10;background:rgba(7,17,29,.86);backdrop-filter:blur(12px);border-bottom:1px solid rgba(129,159,214,.08)}.topbar-inner{max-width:1120px;margin:0 auto;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}.brand{font-size:20px;font-weight:800}.small{font-size:13px;color:var(--muted)}.hero{padding:18px 0 12px}.title{font-size:36px;line-height:1.02;margin:0 0 8px}.sub{font-size:17px;line-height:1.5;color:var(--muted)}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.chip{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.03);border:1px solid var(--line);font-size:12px;color:#dbe6fb}.section{margin-top:18px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:12px}.h2{font-size:26px;margin:0}.hint{color:var(--muted);font-size:14px}.stories{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:18px}.tagrow,.meta{display:flex;gap:8px;flex-wrap:wrap}.tag{padding:6px 10px;border-radius:999px;font-size:12px;border:1px solid var(--line);background:rgba(255,255,255,.03)}.green{color:#b8f3d5;background:rgba(34,201,131,.12)}.yellow{color:#ffe2a9;background:rgba(255,191,105,.12)}.red{color:#ffc4c4;background:rgba(255,120,120,.12)}.blue{color:#c9e4ff;background:rgba(77,163,255,.12)}.purple{color:#e1d7ff;background:rgba(125,92,255,.12)}.h3{font-size:23px;line-height:1.18;margin:12px 0 8px}.summary{font-size:17px;line-height:1.55;color:var(--soft)}.why{margin-top:14px;padding-top:12px;border-top:1px solid rgba(129,159,214,.1);font-size:15px;line-height:1.5;color:#dfe8fb}.meta{margin-top:12px;color:var(--muted);font-size:14px}a{color:#9fdcff;text-decoration:none}.empty{background:rgba(255,255,255,.02);border:1px dashed rgba(129,159,214,.18)}.footer{padding:22px 0 28px;color:var(--muted);font-size:14px}.nav{display:flex;gap:8px;flex-wrap:wrap}.nav a{padding:7px 10px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03)}@media (max-width:860px){.stories{grid-template-columns:1fr}.title{font-size:31px}.topbar-inner{align-items:flex-start;flex-direction:column}}</style></head><body><div class="topbar"><div class="topbar-inner"><div><div class="brand">Clawy News</div><div class="small">דשבורד אישי · feed לפי קטגוריות</div></div><div class="nav"><a href="#technology">טכנולוגיה</a><a href="#israel">ישראל</a><a href="#crypto">קריפטו</a><a href="#hapoel">הפועל פתח תקווה</a><a href="./archive/${archiveDate}.html?v=${archiveDate}">ארכיון היום</a></div></div></div><div class="app"><section class="hero"><h1 class="title">חדשות היום</h1><div class="sub">${archiveDate} · נבנה אוטומטית מתוך selected candidates + state</div><div class="chips"><div class="chip">render-app pipeline</div><div class="chip">עד 5 כתבות לכל תחום</div><div class="chip">state-aware selection</div><div class="chip">archive enabled</div></div></section>${section('technology')}${section('israel')}${section('crypto')}${section('hapoel')}<div class="footer">הגרסה הזו כבר נבנית ישירות מתוך selected candidates, לא מכתיבה ידנית.</div></div></body></html>`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);

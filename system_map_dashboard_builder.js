const fs = require('fs');
const path = require('path');

const base = 'C:\\Users\\Itzhak\\.openclaw\\workspace\\system-map';
const systemsJson = JSON.parse(fs.readFileSync(path.join(base, 'systems.json'), 'utf8').replace(/^\uFEFF/, ''));
const systems = systemsJson.systems || [];

const total = systems.length;
const heavy = systems.filter(s => ['heavy', 'abusive'].includes(s.weight));
const cleanup = systems.filter(s => s.needs_cleanup);
const redesign = systems.filter(s => s.needs_redesign);
const closest = [...systems].filter(s => typeof s.overall_score === 'number').sort((a,b) => b.overall_score - a.overall_score).slice(0, 3);
const attentionNow = systems.filter(s => s.needs_redesign || s.status !== 'active' || ['heavy','abusive'].includes(s.weight));

function esc(v) {
  return String(v ?? 'unknown')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeClass(value, type) {
  const v = String(value || '').toLowerCase();
  if (type === 'status') {
    if (v === 'active') return 'ok';
    if (v === 'inactive') return 'muted';
    if (v === 'broken') return 'bad';
    return 'warn';
  }
  if (type === 'weight') {
    if (v === 'light') return 'ok';
    if (v === 'moderate') return 'info';
    if (v === 'heavy') return 'warn';
    if (v === 'abusive') return 'bad';
  }
  return 'muted';
}

function renderList(items, formatter) {
  if (!items.length) return '<div class="empty">None</div>';
  return `<ul>${items.map(i => `<li>${formatter(i)}</li>`).join('')}</ul>`;
}

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>System Map Dashboard</title>
  <style>
    :root {
      --bg:#f4f7fb;
      --card:#fff;
      --text:#162033;
      --muted:#66758b;
      --line:#e5eaf2;
      --ok:#e8f7ee; --ok-t:#136c43;
      --info:#eaf2ff; --info-t:#1e58b7;
      --warn:#fff4de; --warn-t:#9b6400;
      --bad:#fdeceb; --bad-t:#b42318;
      --mutedbg:#eef2f6; --mutedt:#5d6a7b;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--text)}
    .wrap{max-width:1120px;margin:0 auto;padding:18px 14px 40px}
    .hero,.panel,.card{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:0 8px 24px rgba(22,32,51,.06)}
    .hero{padding:20px;margin-bottom:16px}
    h1{margin:0 0 6px;font-size:28px}
    h2{margin:0 0 12px;font-size:18px}
    .sub{color:var(--muted);font-size:14px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
    .stat{background:#f9fbff;border:1px solid var(--line);border-radius:16px;padding:14px}
    .n{font-size:28px;font-weight:700}
    .section{margin-bottom:16px}
    .panel{padding:16px}
    .cards{display:grid;gap:14px}
    .card{padding:16px}
    .top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
    .title{font-size:18px;font-weight:700}
    .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700}
    .ok{background:var(--ok);color:var(--ok-t)}
    .info{background:var(--info);color:var(--info-t)}
    .warn{background:var(--warn);color:var(--warn-t)}
    .bad{background:var(--bad);color:var(--bad-t)}
    .muted{background:var(--mutedbg);color:var(--mutedt)}
    .meta{color:var(--muted);font-size:13px}
    .summary{margin:10px 0 12px;font-size:14px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .mini{background:#f9fbff;border:1px solid var(--line);border-radius:14px;padding:10px;font-size:13px}
    .mini strong{display:block;margin-bottom:4px}
    ul{margin:0;padding-right:18px}
    li{margin:6px 0}
    a{color:#1e58b7;text-decoration:none;font-weight:600}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
    .empty{color:var(--muted);font-size:14px}
    @media (max-width:820px){.stats,.two,.row{grid-template-columns:1fr}h1{font-size:24px}.wrap{padding:14px 10px 32px}}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero section">
      <h1>System Map</h1>
      <div class="sub">Dashboard קל, מהיר וברור לניהול מערכות OpenClaw.</div>
      <div class="stats">
        <div class="stat"><div class="n">${total}</div><div class="sub">מערכות</div></div>
        <div class="stat"><div class="n">${heavy.length}</div><div class="sub">כבדות</div></div>
        <div class="stat"><div class="n">${cleanup.length}</div><div class="sub">דורשות ניקוי</div></div>
        <div class="stat"><div class="n">${closest.length}</div><div class="sub">קרובות ל-10/10</div></div>
      </div>
    </section>

    <section class="panel section">
      <h2>דורש טיפול עכשיו</h2>
      ${renderList(attentionNow, s => esc(s.display_name))}
    </section>

    <section class="cards section">
      ${systems.map(s => `
        <article class="card">
          <div class="top">
            <div class="title">${esc(s.display_name)}</div>
            <span class="badge ${badgeClass(s.status,'status')}">${esc(s.status)}</span>
            <span class="badge ${badgeClass(s.weight,'weight')}">${esc(s.weight)}</span>
            <span class="badge info">${esc(s.overall_score)}/10</span>
          </div>
          <div class="meta">${esc(s.owner)} · ${esc(s.purpose)}</div>
          <div class="summary">${esc(s.short_summary)}</div>
          <div class="row">
            <div class="mini"><strong>Recommendation</strong>${esc(s.recommendation)}</div>
            <div class="mini"><strong>Key risks</strong>${esc((s.key_risks || []).join(', ') || 'unknown')}</div>
            <div class="mini"><strong>Action</strong>${s.action_link && s.action_link !== 'unknown' ? `<a href="${esc(s.action_link)}">Open</a>` : 'unknown'}</div>
            <div class="mini"><strong>Workspace</strong>${esc(s.workspace_path || 'unknown')}</div>
          </div>
        </article>
      `).join('')}
    </section>

    <div class="two section">
      <section class="panel"><h2>Heavy systems</h2>${renderList(heavy, s => esc(s.display_name))}</section>
      <section class="panel"><h2>Cleanup</h2>${renderList(cleanup, s => esc(s.display_name))}</section>
    </div>

    <div class="two section">
      <section class="panel"><h2>Redesign</h2>${renderList(redesign, s => esc(s.display_name))}</section>
      <section class="panel"><h2>Closest to 10/10</h2>${renderList(closest, s => `${esc(s.display_name)} (${esc(s.overall_score)})`)}</section>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(base, 'dashboard.html'), html, 'utf8');

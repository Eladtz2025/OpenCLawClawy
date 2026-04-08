const fs = require('fs');
const path = require('path');

const base = 'C:\\Users\\Itzhak\\.openclaw\\workspace\\system-map';
const systemsJson = JSON.parse(fs.readFileSync(path.join(base, 'systems.json'), 'utf8').replace(/^\uFEFF/, ''));
const reviewJson = JSON.parse(fs.readFileSync(path.join(base, 'systems_review.json'), 'utf8').replace(/^\uFEFF/, ''));
const systems = systemsJson.systems || [];
const reviewById = Object.fromEntries((reviewJson.reviews || []).map(r => [r.system_id, r]));

const cards = systems.map(s => ({ ...s, review: reviewById[s.system_id] || null }));
const total = cards.length;
const heavyCount = cards.filter(s => ['heavy', 'abusive'].includes(s.weight)).length;
const cleanupCount = cards.filter(s => s.needs_cleanup).length;
const nearTen = cards.filter(s => typeof s.overall_score === 'number' && s.overall_score >= 7.5).length;

const topPriorities = cards.filter(s => s.needs_cleanup || s.needs_redesign || s.status !== 'active');
const topHeavy = cards.filter(s => ['heavy', 'abusive'].includes(s.weight));
const cleanup = cards.filter(s => s.needs_cleanup);
const redesign = cards.filter(s => s.needs_redesign);
const closest = [...cards].filter(s => typeof s.overall_score === 'number').sort((a,b) => b.overall_score - a.overall_score).slice(0, 3);

function esc(s) {
  return String(s ?? 'unknown')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeClass(value, type) {
  const v = String(value || '').toLowerCase();
  if (type === 'status') {
    if (v === 'active') return 'green';
    if (v === 'inactive') return 'gray';
    if (v === 'broken') return 'red';
    return 'amber';
  }
  if (type === 'weight') {
    if (v === 'light') return 'green';
    if (v === 'moderate') return 'blue';
    if (v === 'heavy') return 'amber';
    if (v === 'abusive') return 'red';
  }
  if (type === 'priority') {
    return v === 'true' ? 'red' : 'gray';
  }
  return 'gray';
}

function list(items, formatter) {
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
      --bg:#f3f6fb;
      --card:#ffffff;
      --text:#172033;
      --muted:#62708a;
      --line:#e4e9f2;
      --green:#e7f7ee;
      --green-t:#146c43;
      --blue:#eaf2ff;
      --blue-t:#2157b4;
      --amber:#fff3dd;
      --amber-t:#9a6500;
      --red:#fdeaea;
      --red-t:#b42318;
      --gray:#eef1f5;
      --gray-t:#516071;
    }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width:1100px; margin:0 auto; padding:20px 14px 40px; }
    .hero, .panel, .system-card { background:var(--card); border:1px solid var(--line); border-radius:18px; box-shadow:0 6px 18px rgba(20,32,51,.05); }
    .hero { padding:20px; margin-bottom:16px; }
    h1 { margin:0 0 8px; font-size:28px; }
    h2 { margin:0 0 12px; font-size:18px; }
    .sub { color:var(--muted); font-size:14px; }
    .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:16px; }
    .stat { background:#f8faff; border:1px solid var(--line); border-radius:14px; padding:14px; }
    .stat .n { font-size:28px; font-weight:700; }
    .layout { display:grid; grid-template-columns:1.1fr .9fr; gap:16px; margin-bottom:16px; }
    .panel { padding:16px; }
    ul { margin:0; padding-right:18px; }
    li { margin:6px 0; }
    .systems { display:grid; gap:14px; }
    .system-card { padding:16px; }
    .topline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
    .title { font-size:18px; font-weight:700; }
    .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:600; }
    .green { background:var(--green); color:var(--green-t); }
    .blue { background:var(--blue); color:var(--blue-t); }
    .amber { background:var(--amber); color:var(--amber-t); }
    .red { background:var(--red); color:var(--red-t); }
    .gray { background:var(--gray); color:var(--gray-t); }
    .meta { color:var(--muted); font-size:13px; margin:4px 0; }
    .summary { margin:10px 0; font-size:14px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
    .mini { background:#f8faff; border:1px solid var(--line); border-radius:12px; padding:10px; font-size:13px; }
    .empty { color:var(--muted); font-size:14px; }
    a { color:#2157b4; text-decoration:none; }
    @media (max-width: 820px) {
      .stats, .layout, .grid2 { grid-template-columns:1fr; }
      h1 { font-size:24px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>System Map</h1>
      <div class="sub">מיפוי וביקורת שמרניים לכל מערכות OpenClaw שזוהו.</div>
      <div class="stats">
        <div class="stat"><div class="n">${total}</div><div class="sub">מערכות</div></div>
        <div class="stat"><div class="n">${heavyCount}</div><div class="sub">כבדות</div></div>
        <div class="stat"><div class="n">${cleanupCount}</div><div class="sub">דורשות ניקוי</div></div>
        <div class="stat"><div class="n">${nearTen}</div><div class="sub">קרובות ל-10/10</div></div>
      </div>
    </section>

    <div class="layout">
      <section class="panel">
        <h2>Top priorities</h2>
        ${list(topPriorities, s => `${esc(s.display_name)} <span class="sub">(${esc(s.recommendation)})</span>`)}
      </section>
      <section class="panel">
        <h2>דורש טיפול עכשיו</h2>
        ${list(topPriorities.filter(s => s.needs_redesign || s.status !== 'active' || s.weight === 'heavy' || s.weight === 'abusive'), s => esc(s.display_name))}
      </section>
    </div>

    <div class="layout">
      <section class="panel">
        <h2>Top heavy systems</h2>
        ${list(topHeavy, s => esc(s.display_name))}
      </section>
      <section class="panel">
        <h2>Systems needing cleanup</h2>
        ${list(cleanup, s => esc(s.display_name))}
      </section>
    </div>

    <div class="layout">
      <section class="panel">
        <h2>Systems needing redesign</h2>
        ${list(redesign, s => esc(s.display_name))}
      </section>
      <section class="panel">
        <h2>Closest to 10/10</h2>
        ${list(closest, s => `${esc(s.display_name)} <span class="sub">(${esc(s.overall_score)})</span>`)}
      </section>
    </div>

    <section class="systems">
      ${cards.map(s => `
        <article class="system-card">
          <div class="topline">
            <div class="title">${esc(s.display_name)}</div>
            <span class="badge ${badgeClass(s.status, 'status')}">${esc(s.status)}</span>
            <span class="badge ${badgeClass(s.weight, 'weight')}">${esc(s.weight)}</span>
            <span class="badge blue">score ${esc(s.overall_score)}</span>
          </div>
          <div class="meta">${esc(s.owner)} · ${esc(s.purpose)}</div>
          <div class="summary">${esc(s.short_summary)}</div>
          <div class="grid2">
            <div class="mini"><strong>Recommendation</strong><br>${esc(s.recommendation)}</div>
            <div class="mini"><strong>Key risks</strong><br>${esc((s.key_risks || []).join(', ') || 'unknown')}</div>
            <div class="mini"><strong>Workspace</strong><br>${esc(s.workspace_path || 'unknown')}</div>
            <div class="mini"><strong>Dashboard</strong><br>${s.dashboard_link_if_exists && s.dashboard_link_if_exists !== 'unknown' ? `<a href="${esc(s.dashboard_link_if_exists)}">open</a>` : 'unknown'}</div>
          </div>
        </article>
      `).join('')}
    </section>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(base, 'dashboard.html'), html, 'utf8');

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dataPath = path.join(ROOT, 'dashboard', 'data.json');
const outPath = path.join(ROOT, 'dashboard', 'index.html');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function badge(status) {
  const cls = status === 'OK' ? 'ok' : status === 'WARNING' ? 'warn' : 'crit';
  return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
}

function renderChecks(items) {
  return items.map(item => '<tr><td>' + esc(item.name) + '</td><td>' + badge(item.status) + '</td><td>' + esc(item.summary) + '</td></tr>').join('');
}

function renderSimple(items, keys) {
  return (items || []).map(item => '<tr>' + keys.map(k => '<td>' + esc(item[k]) + '</td>').join('') + '</tr>').join('');
}

function card(title, value, sub = '') {
  return '<div class="card"><div class="label">' + esc(title) + '</div><div class="value">' + value + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
}

const lastCriticalEvent = (data.recent_failures || []).find(x => /critical/i.test(String(x.kind)) || /critical/i.test(String(x.summary))) || null;
const systemsNeedingReview = [];
if (data.computer_status !== 'OK') systemsNeedingReview.push('מחשב');
if (data.openclaw_status !== 'OK') systemsNeedingReview.push('OpenClaw');

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.system_name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#0a0f1a;color:#e5e7eb;margin:0;padding:20px}
    .wrap{max-width:1200px;margin:0 auto}
    h1,h2{margin:0 0 12px}
    .hero{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap;margin-bottom:18px}
    .muted{color:#94a3b8;font-size:13px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:16px 0 22px}
    .columns{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}
    .stack{display:grid;gap:16px}
    .card{background:#111827;border:1px solid #243046;border-radius:14px;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
    .label{color:#94a3b8;font-size:12px;margin-bottom:8px}
    .value{font-size:24px;font-weight:700}
    .sub{margin-top:8px;color:#cbd5e1;font-size:13px;line-height:1.45}
    .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:700;font-size:12px}
    .ok{background:#123524;color:#9ae6b4}.warn{background:#43320b;color:#f6e05e}.crit{background:#4a1f1f;color:#feb2b2}
    table{width:100%;border-collapse:collapse;background:#111827;border-radius:14px;overflow:hidden}
    th,td{padding:10px 12px;border-bottom:1px solid #243046;text-align:right;vertical-align:top}
    th{background:#162033;color:#cbd5e1}
    tr:last-child td{border-bottom:none}
    .list{display:grid;gap:10px}
    .item{padding:10px 12px;border:1px solid #243046;border-radius:12px;background:#0f172a}
    .item strong{display:block;margin-bottom:4px}
    @media (max-width: 900px){.columns{grid-template-columns:1fr}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div>
      <h1>${esc(data.system_name)}</h1>
      <div class="muted">Last check: ${esc(data.generated_at)}</div>
    </div>
    <div>${badge(data.overall_status)}</div>
  </div>

  <div class="grid">
    ${card('מצב כללי', badge(data.overall_status))}
    ${card('מצב מחשב', badge(data.computer_status))}
    ${card('מצב OpenClaw', badge(data.openclaw_status))}
    ${card('Last check', esc(data.generated_at))}
    ${card('Last critical event', lastCriticalEvent ? esc(lastCriticalEvent.summary) : 'אין')}
    ${card('Systems needing review', esc(systemsNeedingReview.join(', ') || 'אין'))}
  </div>

  <div class="columns">
    <div class="stack">
      <div class="card">
        <h2>Issues אחרונים</h2>
        <table><thead><tr><th>זמן</th><th>סוג</th><th>סיכום</th></tr></thead><tbody>${renderSimple((data.recent_failures || []).slice(0,8), ['time','kind','summary'])}</tbody></table>
      </div>
      <div class="card">
        <h2>Fixes אחרונים</h2>
        <table><thead><tr><th>זמן</th><th>פעולה</th><th>יעד</th><th>תוצאה</th></tr></thead><tbody>${renderSimple((data.last_fixes || []).slice(0,8), ['time','type','target','result'])}</tbody></table>
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <h2>Top offenders</h2>
        <div class="list">${(data.top_offenders || []).slice(0,5).map(item => '<div class="item"><strong>' + esc(item.name) + '</strong><div>CPU: ' + esc(item.cpu) + '</div><div>Memory: ' + esc(item.memoryMb) + ' MB</div><div class="muted">' + esc(item.path || 'n/a') + '</div></div>').join('')}</div>
      </div>
      <div class="card">
        <h2>מצב מחשב</h2>
        <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${renderChecks(data.computer_checks || [])}</tbody></table>
      </div>
      <div class="card">
        <h2>מצב OpenClaw</h2>
        <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${renderChecks(data.openclaw_checks || [])}</tbody></table>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
module.exports = { outPath };

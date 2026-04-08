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

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.system_name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#0b1020;color:#e5e7eb;margin:0;padding:24px}
    .wrap{max-width:1200px;margin:0 auto}
    h1,h2{margin:0 0 12px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:16px 0 24px}
    .card{background:#11182d;border:1px solid #24304d;border-radius:14px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.18)}
    .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:700;font-size:12px}
    .ok{background:#123524;color:#9ae6b4}.warn{background:#43320b;color:#f6e05e}.crit{background:#4a1f1f;color:#feb2b2}
    table{width:100%;border-collapse:collapse;background:#11182d;border-radius:14px;overflow:hidden}
    th,td{padding:10px 12px;border-bottom:1px solid #24304d;text-align:right;vertical-align:top}
    th{background:#16203b}
    .muted{color:#9ca3af;font-size:13px}
  </style>
</head>
<body>
<div class="wrap">
  <h1>${esc(data.system_name)}</h1>
  <div class="muted">בדיקה אחרונה: ${esc(data.generated_at)}</div>
  <div class="grid">
    <div class="card"><h2>מצב כללי</h2>${badge(data.overall_status)}</div>
    <div class="card"><h2>מצב מחשב</h2>${badge(data.computer_status)}</div>
    <div class="card"><h2>מצב OpenClaw</h2>${badge(data.openclaw_status)}</div>
    <div class="card"><h2>כשלים אחרונים</h2><div>${esc((data.recent_failures || []).slice(0,3).map(x=>x.summary).join(' | ') || 'אין')}</div></div>
    <div class="card"><h2>תיקונים אחרונים</h2><div>${esc((data.last_fixes || []).slice(0,3).map(x=>x.type + ': ' + x.target).join(' | ') || 'אין')}</div></div>
    <div class="card"><h2>Top offenders</h2><div>${esc((data.top_offenders || []).slice(0,3).map(x=>x.name + ' CPU:' + x.cpu + ' MEM:' + x.memoryMb + 'MB').join(' | ') || 'אין')}</div></div>
  </div>

  <h2>בדיקות מחשב</h2>
  <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${renderChecks(data.computer_checks || [])}</tbody></table>
  <h2 style="margin-top:24px">בדיקות OpenClaw</h2>
  <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${renderChecks(data.openclaw_checks || [])}</tbody></table>
  <h2 style="margin-top:24px">כשלים אחרונים</h2>
  <table><thead><tr><th>זמן</th><th>סוג</th><th>סיכום</th></tr></thead><tbody>${renderSimple(data.recent_failures || [], ['time','kind','summary'])}</tbody></table>
  <h2 style="margin-top:24px">תיקונים אחרונים</h2>
  <table><thead><tr><th>זמן</th><th>פעולה</th><th>יעד</th><th>תוצאה</th></tr></thead><tbody>${renderSimple(data.last_fixes || [], ['time','type','target','result'])}</tbody></table>
  <h2 style="margin-top:24px">Top offenders</h2>
  <table><thead><tr><th>Process</th><th>CPU</th><th>Memory MB</th><th>Path</th></tr></thead><tbody>${renderSimple(data.top_offenders || [], ['name','cpu','memoryMb','path'])}</tbody></table>
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
module.exports = { outPath };

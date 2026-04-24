const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dataPath = path.join(ROOT, 'dashboard', 'data.json');
const outPath = path.join(ROOT, 'dashboard', 'index.html');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusLabelHe(status) {
  if (status === 'WARNING') return 'אזהרה';
  if (status === 'CRITICAL') return 'קריטי';
  return 'תקין';
}

function badge(status) {
  const cls = status === 'OK' ? 'ok' : status === 'WARNING' ? 'warn' : 'crit';
  return '<span class="badge ' + cls + '">' + esc(statusLabelHe(status)) + '</span>';
}

function pill(text, cls = 'soft') {
  return '<span class="pill ' + cls + '">' + esc(text) + '</span>';
}

function shortSummary(text) {
  return String(text || '')
    .replace('Internet failed:', 'יעד אינטרנט לא נגיש:')
    .replace('No cron jobs found (unavailable)', 'אין כרגע מידע על cron jobs')
    .replace('Defender OK', 'Defender תקין')
    .replace('Firewall OK', 'Firewall תקין')
    .replace('Growth items:', 'נמצאו תיקיות למעקב:')
    .replace('OpenClaw tasks found', 'משימות OpenClaw זמינות')
    .replace('Ping OK', 'חיבור רשת תקין')
    .replace('Services OK', 'השירותים תקינים')
    .replace('Ports missing:', 'פורטים חסרים:');
}

function tableRows(items) {
  return items.map(item => '<tr><td>' + esc(item.name) + '</td><td>' + badge(item.status) + '</td><td>' + esc(shortSummary(item.summary)) + '</td></tr>').join('');
}

function classifyIssue(item, insight) {
  const sev = insight?.severity || item.status || 'WARNING';
  const urgency = sev === 'CRITICAL' ? 'קריטי' : sev === 'WARNING' ? 'אזהרה' : 'מידע';
  const cls = sev === 'CRITICAL' ? 'crit' : sev === 'WARNING' ? 'warn' : 'soft';
  return {
    title: shortSummary(item.summary),
    urgency,
    cls,
    confidence: insight?.confidence || 'medium',
    effect: insight?.impact || 'דורש בדיקה',
    next: insight?.next || 'לבדוק ידנית'
  };
}

const insights = data.insights || [];
const recentFailures = (data.recent_failures || []).slice(0, 8).map((item, index) => ({ raw: item, ...classifyIssue(item, insights[index]?.insight) }));
const actionable = recentFailures.filter(x => x.urgency !== 'מידע');
const informational = recentFailures.filter(x => x.urgency === 'מידע');
const policySummary = data.policy?.allow_automatic_actions === false ? 'ללא פעולות אוטומטיות' : 'מדיניות לא ידועה';
const latestReason = actionable[0]?.title || informational[0]?.title || 'כל הבדיקות האחרונות תקינות';

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.system_name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#0a0f1a;color:#e5e7eb;margin:0;padding:18px}
    .wrap{max-width:1200px;margin:0 auto}
    .grid{display:grid;gap:16px}
    .top{display:grid;grid-template-columns:1.3fr .7fr;gap:16px;margin-bottom:16px}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .panel,.card{background:#111827;border:1px solid #243046;border-radius:18px;padding:18px;box-shadow:0 10px 28px rgba(0,0,0,.18)}
    .card .value{font-size:26px;font-weight:800}.muted{color:#94a3b8}.sub{color:#cbd5e1;line-height:1.55}
    .badge,.pill{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px}
    .ok{background:#123524;color:#9ae6b4}.warn{background:#43320b;color:#f6e05e}.crit{background:#4a1f1f;color:#feb2b2}.soft{background:#1e293b;color:#cbd5e1}
    .section{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .list{display:grid;gap:12px}.item{padding:14px;border:1px solid #243046;border-radius:14px;background:#0f172a}
    .item strong{display:block;margin-bottom:6px}
    table{width:100%;border-collapse:collapse} th,td{padding:11px;border-bottom:1px solid #243046;text-align:right;vertical-align:top}
    th{background:#162033;color:#cbd5e1} tr:last-child td{border-bottom:none}
    @media (max-width: 900px){.top,.section,.cards{grid-template-columns:1fr}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="panel">
      <div class="muted">${esc(data.system_name)}</div>
      <h1 style="margin:8px 0 12px">${esc(statusLabelHe(data.overall_status))}</h1>
      ${badge(data.overall_status)} ${pill(policySummary, 'soft')}
      <div class="sub" style="margin-top:14px">${esc(latestReason)}</div>
      <div class="cards" style="margin-top:16px">
        <div class="card"><div class="muted">בדיקה אחרונה</div><div class="value" style="font-size:16px">${esc(data.generated_at)}</div></div>
        <div class="card"><div class="muted">דורש טיפול</div><div class="value">${esc(actionable.length)}</div></div>
        <div class="card"><div class="muted">מידע בלבד</div><div class="value">${esc(informational.length)}</div></div>
      </div>
    </div>
    <div class="grid">
      <div class="card"><div class="muted">מצב מחשב</div><div class="value">${esc(statusLabelHe(data.computer_status))}</div></div>
      <div class="card"><div class="muted">מצב OpenClaw</div><div class="value">${esc(statusLabelHe(data.openclaw_status))}</div></div>
      <div class="card"><div class="muted">מדיניות</div><div class="value" style="font-size:18px">Read Only</div><div class="sub">המערכת לא מבצעת תיקונים לבד</div></div>
    </div>
  </div>

  <div class="section">
    <div class="panel">
      <h2>דורש טיפול</h2>
      <div class="list">
        ${actionable.length ? actionable.map(item => `<div class="item"><strong>${esc(item.title)}</strong>${pill(item.urgency, item.cls)} ${pill(item.confidence === 'high' ? 'ביטחון גבוה' : item.confidence === 'medium' ? 'ביטחון בינוני' : 'ביטחון נמוך', item.confidence === 'high' ? 'crit' : item.confidence === 'medium' ? 'warn' : 'soft')}<div class="sub" style="margin-top:8px">${esc(item.effect)}</div><div class="sub">המלצה: ${esc(item.next)}</div></div>`).join('') : '<div class="item"><strong>אין כרגע</strong><div class="sub">לא זוהו פריטים דחופים.</div></div>'}
      </div>
    </div>
    <div class="panel">
      <h2>מידע בלבד</h2>
      <div class="list">
        ${informational.length ? informational.map(item => `<div class="item"><strong>${esc(item.title)}</strong>${pill('מידע', 'soft')}<div class="sub" style="margin-top:8px">${esc(item.effect)}</div></div>`).join('') : '<div class="item"><strong>אין כרגע</strong><div class="sub">אין פריטי מידע פתוחים.</div></div>'}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="panel">
      <h2>בדיקות מחשב</h2>
      <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${tableRows(data.computer_checks || [])}</tbody></table>
    </div>
    <div class="panel">
      <h2>בדיקות OpenClaw</h2>
      <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${tableRows(data.openclaw_checks || [])}</tbody></table>
    </div>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
module.exports = { outPath };

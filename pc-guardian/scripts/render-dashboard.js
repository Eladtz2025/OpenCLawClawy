const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dataPath = path.join(ROOT, 'dashboard', 'data.json');
const outPath = path.join(ROOT, 'dashboard', 'index.html');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusLabel(status) {
  if (status === 'WARNING') return 'Warning';
  if (status === 'CRITICAL') return 'Critical';
  return 'OK';
}

function badge(status) {
  const cls = status === 'OK' ? 'ok' : status === 'WARNING' ? 'warn' : 'crit';
  return '<span class="badge ' + cls + '">' + esc(statusLabel(status)) + '</span>';
}

function renderChecks(items) {
  return items.map(item => '<tr><td>' + esc(item.name) + '</td><td>' + badge(item.status) + '</td><td>' + esc(shortSummary(item.summary)) + '</td></tr>').join('');
}

function renderSimple(items, keys) {
  return (items || []).map(item => '<tr>' + keys.map(k => '<td>' + esc(item[k]) + '</td>').join('') + '</tr>').join('');
}

function card(title, value, sub = '', tone = '') {
  return '<div class="card ' + tone + '"><div class="label">' + esc(title) + '</div><div class="value">' + value + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
}

function shortSummary(text) {
  return String(text || '')
    .replace('Internet failed:', 'אין גישה אל:')
    .replace('No cron artifacts found', 'לא זוהו cron jobs')
    .replace('Defender OK', 'Defender תקין')
    .replace('Firewall OK', 'Firewall תקין')
    .replace('Growth items:', 'נמצאו תיקיות למעקב:')
    .replace('OpenClaw tasks found', 'משימות OpenClaw זמינות')
    .replace('Ping OK', 'חיבור רשת תקין')
    .replace('Services OK', 'השירותים תקינים');
}

function humanFix(item) {
  const actionMap = {
    restart_task: 'בוצע ניסיון הפעלה מחדש למשימה',
    restart_service: 'בוצע ניסיון הפעלה מחדש לשירות',
    cleanup_safe_path: 'נוקה אזור בטוח',
    fallback_model: 'סומן מעבר לפולבק',
    disable_repeating_cron: 'cron הושבת זמנית',
    stop_runaway_process: 'תהליך חריג נעצר',
    stop_runaway_backup: 'גיבוי חריג נעצר'
  };
  const action = actionMap[item.type] || item.type;
  const result = item.result === 'success' ? 'הצליח' : item.result === 'failed' ? 'נכשל' : item.result;
  return { ...item, action, result, target: item.target };
}

function priorityFromFailure(item) {
  const summary = shortSummary(item.summary);
  const urgency = item.kind === 'Cron Jobs' ? 'Warning' : item.kind === 'Internet Reachability' ? 'Warning' : 'Critical';
  return { title: summary, urgency, kind: item.kind };
}

function offenderLevel(item, index) {
  if (item.memoryMb >= 1024 || item.cpu >= 5000) return { label: 'דורש טיפול', cls: 'crit' };
  if (item.memoryMb >= 500 || item.cpu >= 1500 || index === 0) return { label: 'חריג', cls: 'warn' };
  return { label: 'גבוה', cls: 'soft' };
}

const recentFailures = data.recent_failures || [];
const lastCriticalEvent = recentFailures.find(x => /critical/i.test(String(x.kind)) || /critical/i.test(String(x.summary))) || null;
const systemsNeedingReview = [];
if (data.computer_status !== 'OK') systemsNeedingReview.push('המחשב');
if (data.openclaw_status !== 'OK') systemsNeedingReview.push('OpenClaw');

const openIssues = recentFailures.slice(0, 6).map(priorityFromFailure);
const lastFixes = (data.last_fixes || []).slice(0, 6).map(humanFix);
const nonOkChecks = [...(data.computer_checks || []), ...(data.openclaw_checks || [])].filter(x => x.status !== 'OK');
const overallReason = nonOkChecks.length ? shortSummary(nonOkChecks[0].summary) : 'כל הבדיקות האחרונות תקינות';
const problemCount = nonOkChecks.length;
const topPriorities = openIssues.slice(0, 3);

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.system_name)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#0a0f1a;color:#e5e7eb;margin:0;padding:18px}
    .wrap{max-width:1200px;margin:0 auto}
    h1,h2,h3{margin:0 0 12px}
    .hero{display:grid;grid-template-columns:1.25fr .75fr;gap:16px;margin-bottom:18px}
    .hero-card,.card{background:#111827;border:1px solid #243046;border-radius:18px;padding:18px;box-shadow:0 10px 28px rgba(0,0,0,.18)}
    .hero-card{padding:22px}
    .hero-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .hero-main{font-size:34px;font-weight:800;line-height:1.1}
    .hero-sub{font-size:16px;color:#dbe3f0;line-height:1.6}
    .hero-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
    .label{color:#94a3b8;font-size:13px;margin-bottom:8px}
    .value{font-size:26px;font-weight:700}
    .sub{margin-top:8px;color:#cbd5e1;font-size:15px;line-height:1.55}
    .muted{color:#94a3b8;font-size:14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:18px 0}
    .columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .stack{display:grid;gap:16px}
    .badge{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:800;font-size:13px}
    .ok{background:#123524;color:#9ae6b4}.warn{background:#43320b;color:#f6e05e}.crit{background:#4a1f1f;color:#feb2b2}.soft{background:#1e293b;color:#cbd5e1}
    table{width:100%;border-collapse:collapse;background:#111827;border-radius:14px;overflow:hidden}
    th,td{padding:12px 12px;border-bottom:1px solid #243046;text-align:right;vertical-align:top;font-size:14px}
    th{background:#162033;color:#cbd5e1}
    tr:last-child td{border-bottom:none}
    .list{display:grid;gap:12px}
    .item{padding:14px;border:1px solid #243046;border-radius:14px;background:#0f172a}
    .item strong{display:block;margin-bottom:6px;font-size:16px}
    .priority{border-right:4px solid #f6e05e}
    .priority.critline{border-right-color:#feb2b2}
    .pill{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800}
    .section-title{margin-bottom:10px;font-size:22px}
    @media (max-width: 900px){
      body{padding:14px}
      .hero,.columns{grid-template-columns:1fr}
      .hero-main{font-size:28px}
      .hero-meta{grid-template-columns:1fr}
      .value{font-size:24px}
      th,td{padding:11px 10px;font-size:15px}
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="hero-card">
      <div class="hero-title">
        <div>
          <div class="muted">מצב כללי</div>
          <div class="hero-main">${esc(statusLabel(data.overall_status))}</div>
        </div>
        <div>${badge(data.overall_status)}</div>
      </div>
      <div class="hero-sub">${esc(overallReason)}</div>
      <div class="hero-meta">
        ${card('בדיקות בבעיה', esc(problemCount), problemCount ? 'דורש תשומת לב' : 'אין בעיות פתוחות')}
        ${card('מערכות בבעיה', esc(systemsNeedingReview.length), systemsNeedingReview.join(', ') || 'הכול תקין')}
        ${card('בדיקה אחרונה', esc(data.generated_at), 'עודכן עכשיו')}
      </div>
    </div>
    <div class="stack">
      ${card('מצב מחשב', badge(data.computer_status), data.computer_status === 'OK' ? 'ללא חריגות משמעותיות' : 'יש נקודות שדורשות בדיקה')}
      ${card('מצב OpenClaw', badge(data.openclaw_status), data.openclaw_status === 'OK' ? 'יציב' : 'יש פריטים פתוחים')}
      ${card('אירוע קריטי אחרון', lastCriticalEvent ? esc(shortSummary(lastCriticalEvent.summary)) : 'אין', lastCriticalEvent ? esc(lastCriticalEvent.time) : 'לא זוהה')}
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2 class="section-title">דורש טיפול עכשיו</h2>
      <div class="list">${topPriorities.length ? topPriorities.map(item => '<div class="item priority ' + (item.urgency === 'Critical' ? 'critline' : '') + '"><strong>' + esc(item.title) + '</strong><span class="pill ' + (item.urgency === 'Critical' ? 'crit' : 'warn') + '">' + esc(item.urgency) + '</span></div>').join('') : '<div class="item"><strong>אין כרגע</strong><div class="muted">לא זוהו דברים דחופים.</div></div>'}</div>
    </div>
    ${card('מה עדיין פתוח', esc(openIssues.length ? openIssues[0].title : 'אין'), openIssues.length > 1 ? 'ועוד ' + (openIssues.length - 1) + ' פריטים' : 'ללא פריטים נוספים')}
    ${card('מה תוקן אוטומטית', esc(lastFixes.length ? lastFixes[0].action : 'אין'), lastFixes.length ? lastFixes[0].target + ' · ' + lastFixes[0].result : 'לא בוצעו תיקונים לאחרונה')}
    ${card('מה רק Warning', esc(openIssues.filter(x => x.urgency === 'Warning').length), 'לא קריטי, אבל כדאי לבדוק')}
  </div>

  <div class="columns">
    <div class="stack">
      <div class="card">
        <h2 class="section-title">תקלות אחרונות</h2>
        <table><thead><tr><th>מתי</th><th>נושא</th><th>מה קורה</th></tr></thead><tbody>${renderSimple(recentFailures.slice(0,8).map(item => ({ time: item.time, kind: item.kind === 'Internet Reachability' ? 'גישה לאינטרנט' : item.kind === 'Cron Jobs' ? 'Cron jobs' : item.kind, summary: shortSummary(item.summary) })), ['time','kind','summary'])}</tbody></table>
      </div>
      <div class="card">
        <h2 class="section-title">תוקן אוטומטית</h2>
        <table><thead><tr><th>מתי</th><th>מה בוצע</th><th>יעד</th><th>תוצאה</th></tr></thead><tbody>${renderSimple(lastFixes, ['time','action','target','result'])}</tbody></table>
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <h2 class="section-title">Top offenders</h2>
        <div class="list">${(data.top_offenders || []).slice(0,5).map((item, index) => {
          const level = offenderLevel(item, index);
          return '<div class="item"><strong>' + esc(item.name) + '</strong><div>CPU: ' + esc(item.cpu) + '</div><div>זיכרון: ' + esc(item.memoryMb) + ' MB</div><div class="muted">' + esc(item.path || 'ללא נתיב') + '</div><span class="pill ' + level.cls + '">' + esc(level.label) + '</span></div>';
        }).join('')}</div>
      </div>
      <div class="card">
        <h2 class="section-title">מצב מחשב</h2>
        <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${renderChecks(data.computer_checks || [])}</tbody></table>
      </div>
      <div class="card">
        <h2 class="section-title">מצב OpenClaw</h2>
        <table><thead><tr><th>בדיקה</th><th>מצב</th><th>סיכום</th></tr></thead><tbody>${renderChecks(data.openclaw_checks || [])}</tbody></table>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
module.exports = { outPath };

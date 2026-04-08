const fs = require('fs');
const path = require('path');

const base = 'C:\\Users\\Itzhak\\.openclaw\\workspace\\system-map';
const systems = JSON.parse(fs.readFileSync(path.join(base, 'systems.json'), 'utf8').replace(/^\uFEFF/, ''));
const review = JSON.parse(fs.readFileSync(path.join(base, 'systems_review.json'), 'utf8').replace(/^\uFEFF/, ''));

const reviewById = Object.fromEntries((review.reviews || []).map(r => [r.system_id, r]));
const systemsList = (systems.systems || []).map(s => {
  const r = reviewById[s.system_id] || {};
  return {
    name: s.name,
    owner: s.user_owner,
    purpose: s.purpose,
    status: s.status,
    overallScore: r.overall_score?.score ?? s.review?.scores?.overall_score?.score ?? 'unknown',
    weight: r.weight_assessment ?? s.review?.weight_assessment ?? s.estimated_weight ?? 'unknown',
    shortNotes: r.notes ?? s.review?.notes ?? '',
    recommendation: r.recommendation ?? s.review?.recommendation ?? 'unknown'
  };
});

const closest = [...systemsList]
  .filter(s => typeof s.overallScore === 'number')
  .sort((a, b) => b.overallScore - a.overallScore)
  .slice(0, 5);
const heavy = systemsList.filter(s => ['heavy', 'abusive'].includes(s.weight));
const cleanup = systemsList.filter(s => ['needs cleanup', 'archive', 'manual review'].includes(s.recommendation));
const redesign = systemsList.filter(s => ['needs redesign'].includes(s.recommendation) || /refactor|not clean|אוסף פרויקטים/.test(s.shortNotes));

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>System Map Dashboard</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; background:#f6f7fb; color:#1f2937; }
    h1,h2 { margin: 0 0 12px; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin:20px 0; }
    .card { background:#fff; border-radius:14px; padding:16px; box-shadow:0 1px 4px rgba(0,0,0,.08); }
    .system { margin-bottom:16px; }
    .meta { color:#6b7280; font-size:14px; margin:4px 0; }
    .score { font-size:28px; font-weight:700; }
    .badge { display:inline-block; padding:4px 10px; border-radius:999px; background:#eef2ff; color:#3730a3; font-size:12px; margin-left:6px; }
    ul { margin:8px 0 0; padding-right:18px; }
    .systems { display:grid; gap:14px; }
  </style>
</head>
<body>
  <h1>System Map Dashboard</h1>
  <div class="grid">
    <div class="card"><h2>מערכות</h2><div class="score">${systemsList.length}</div></div>
    <div class="card"><h2>כבדות</h2><div class="score">${heavy.length}</div></div>
    <div class="card"><h2>צריכות ניקוי</h2><div class="score">${cleanup.length}</div></div>
    <div class="card"><h2>קרובות ל-10/10</h2><div class="score">${closest.length}</div></div>
  </div>

  <div class="card">
    <h2>כל המערכות</h2>
    <div class="systems">
      ${systemsList.map(s => `
        <div class="system">
          <div><strong>${s.name}</strong> <span class="badge">${s.owner}</span><span class="badge">${s.status}</span><span class="badge">${s.weight}</span></div>
          <div class="meta">${s.purpose}</div>
          <div class="meta">Overall score: ${s.overallScore}</div>
          <div class="meta">Recommendation: ${s.recommendation}</div>
          <div>${s.shortNotes || ''}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="grid">
    <div class="card"><h2>Top heavy systems</h2><ul>${heavy.map(s => `<li>${s.name}</li>`).join('') || '<li>None</li>'}</ul></div>
    <div class="card"><h2>Systems needing cleanup</h2><ul>${cleanup.map(s => `<li>${s.name}</li>`).join('') || '<li>None</li>'}</ul></div>
    <div class="card"><h2>Systems needing redesign</h2><ul>${redesign.map(s => `<li>${s.name}</li>`).join('') || '<li>None</li>'}</ul></div>
    <div class="card"><h2>Closest to 10/10</h2><ul>${closest.map(s => `<li>${s.name} (${s.overallScore})</li>`).join('') || '<li>None</li>'}</ul></div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(base, 'dashboard.html'), html, 'utf8');

const fs = require('fs');
const path = require('path');

const workspace = 'C:\\Users\\Itzhak\\.openclaw\\workspace';
const outputDir = path.join(workspace, 'system-map');
fs.mkdirSync(outputDir, { recursive: true });

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function grade(score) {
  if (score == null) return 'unknown';
  if (score >= 9) return 'excellent';
  if (score >= 7.5) return 'good';
  if (score >= 6) return 'acceptable';
  if (score >= 4) return 'weak';
  return 'critical';
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

const now = new Date().toISOString();
const publicDashboard = 'https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html';

const itzhakCfg = loadJson('C:\\Users\\Itzhak\\.openclaw\\openclaw.json') || {};
const openclawCfg = loadJson('C:\\Users\\Openclaw\\.openclaw\\openclaw.json') || {};
const cron = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'cron.json')) || [];
const workspaces = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'workspaces.json')) || [];
const logs = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'logs.json')) || [];
const tasks = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'scheduled_tasks.json')) || [];
const processes = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'processes.json')) || [];
const ports = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'ports.json')) || [];

const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const cronA = arr(cron), wsA = arr(workspaces), logsA = arr(logs), tasksA = arr(tasks), procA = arr(processes), portsA = arr(ports);

const portsByPid = {};
for (const p of portsA) {
  if (!p || typeof p !== 'object') continue;
  if (!portsByPid[p.OwningProcess]) portsByPid[p.OwningProcess] = [];
  portsByPid[p.OwningProcess].push(p.LocalPort);
}

let itzhakPid = null, openclawPid = null;
for (const p of procA) {
  const cmd = String(p.CommandLine || '').toLowerCase();
  if (cmd.includes('gateway --port 18789')) itzhakPid = p.ProcessId;
  if (cmd.includes('gateway --port 18790')) openclawPid = p.ProcessId;
}

const openTasks = tasksA.filter(t => (t.TaskName || '').includes('OpenClaw'));
const cronPaths = cronA.map(x => x.FullName).filter(Boolean);
const workspacePaths = wsA.map(x => x.FullName).filter(Boolean);
const logPaths = logsA.map(x => x.FullName).filter(Boolean);
const customWorkspaceHits = workspacePaths.filter(p => /news-dashboard|image-team|backup-manager|smoke-test-build/i.test(p));

function scoreCard(values, explanations) {
  const scored = {};
  for (const [k, v] of Object.entries(values)) {
    scored[k] = { score: v, rating: grade(v), explanation: explanations[k] || 'unknown' };
  }
  return scored;
}

function overallFrom(values) {
  const nums = Object.values(values).filter(v => typeof v === 'number');
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

const rawSystems = [
  {
    system_id: 'openclaw-itzhak-main',
    name: 'OpenClaw Itzhak Main',
    display_name: 'Itzhak Main Runtime',
    owner: 'Itzhak',
    purpose: 'Primary OpenClaw runtime for Itzhak with Telegram and local dashboard.',
    status: 'active',
    workspace_path: itzhakCfg?.agents?.defaults?.workspace || 'unknown',
    related_ports: uniq([...(portsByPid[itzhakPid] || []), 18789, 18791]).sort((a,b)=>a-b),
    related_tasks: uniq(openTasks.filter(t => /Itzhak|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName)),
    related_cron_jobs: uniq(cronPaths.filter(p => p.startsWith('C:\\Users\\Itzhak\\.openclaw\\cron'))),
    last_updated_if_known: itzhakCfg?.meta?.lastTouchedAt || 'unknown',
    dashboard_link_if_exists: publicDashboard,
    key_risks: [
      'open telegram groupPolicy',
      'full exec exposure',
      'many config backup snapshots'
    ],
    short_summary: 'רץ בפועל ודי ברור, אבל פתוח מדי ובעל שאריות קונפיג.',
    estimated_weight: 'moderate'
  },
  {
    system_id: 'openclaw-openclaw-main',
    name: 'OpenClaw Openclaw Main',
    display_name: 'Openclaw Main Runtime',
    owner: 'Openclaw',
    purpose: 'Secondary OpenClaw runtime for Openclaw user with Telegram and local dashboard.',
    status: 'active',
    workspace_path: openclawCfg?.agents?.defaults?.workspace || 'unknown',
    related_ports: uniq([...(portsByPid[openclawPid] || []), 18790, 18792]).sort((a,b)=>a-b),
    related_tasks: uniq(openTasks.filter(t => /Openclaw|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName)),
    related_cron_jobs: uniq(cronPaths.filter(p => p.startsWith('C:\\Users\\Openclaw\\.openclaw\\cron'))),
    last_updated_if_known: openclawCfg?.meta?.lastTouchedAt || 'unknown',
    dashboard_link_if_exists: publicDashboard,
    key_risks: [
      'open telegram groupPolicy',
      'full exec exposure',
      'fallback model not verified'
    ],
    short_summary: 'פעיל ושמיש, אבל בטיחות חלשה וחלק מהקונפיג לא מאומת.',
    estimated_weight: 'moderate'
  },
  {
    system_id: 'workspace-custom-systems',
    name: 'Workspace Custom Systems Cluster',
    display_name: 'Custom Workspace Cluster',
    owner: 'Itzhak',
    purpose: 'Mixed custom systems found in the Itzhak workspace.',
    status: 'unknown',
    workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace',
    related_ports: [],
    related_tasks: [],
    related_cron_jobs: [],
    last_updated_if_known: 'unknown',
    dashboard_link_if_exists: 'unknown',
    key_risks: [
      'mixed active and stale projects',
      'git residue',
      'unclear ownership by subproject'
    ],
    short_summary: 'אוסף פרויקטים מעורבב, לא מערכת אחת נקייה.',
    estimated_weight: 'heavy'
  }
];

const reviewInputs = {
  'openclaw-itzhak-main': {
    scores: {
      architecture_score: 6.5,
      clarity_score: 6.0,
      runtime_weight_score: 6.5,
      resource_fit_score: 7.0,
      maintainability_score: 5.5,
      safety_score: 2.5,
      noise_score: 5.5,
      residue_risk_score: 4.5,
      reliability_score: 7.5
    },
    explanations: {
      architecture_score: 'מבנה סביר, אבל רמת החשיפה גבוהה מדי.',
      clarity_score: 'המערכת מובנת חלקית, אך לא מספיק מבודדת.',
      runtime_weight_score: 'המשקל סביר ביחס להרצה שוטפת.',
      resource_fit_score: 'מתאים למחשב הזה בלי עומס חריג.',
      maintainability_score: 'יש קבצי גיבוי ושאריות שמכבידים על ניהול.',
      safety_score: 'הבטיחות חלשה בגלל exec מלא בקבוצה פתוחה.',
      noise_score: 'רעש בינוני, לא קיצוני.',
      residue_risk_score: 'יש סיכון residue ממשי אבל לא קיצוני.',
      reliability_score: 'נראה רץ ויציב בפועל.'
    },
    weight: 'moderate',
    recommendation: 'improve later',
    needs_cleanup: true,
    needs_redesign: false,
    summary: 'טוב תפעולית, חלש בבטיחות ובניקיון קונפיג.'
  },
  'openclaw-openclaw-main': {
    scores: {
      architecture_score: 6.0,
      clarity_score: 5.5,
      runtime_weight_score: 6.5,
      resource_fit_score: 6.5,
      maintainability_score: 5.0,
      safety_score: 2.5,
      noise_score: 5.5,
      residue_risk_score: 4.5,
      reliability_score: 7.0
    },
    explanations: {
      architecture_score: 'מבנה בסיסי תקין, אך יש חוסר בהירות סביב fallback.',
      clarity_score: 'הקריאות ניהולית בינונית.',
      runtime_weight_score: 'לא נראה כבד מדי.',
      resource_fit_score: 'מתאים למחשב הזה ברמה סבירה.',
      maintainability_score: 'לא מספיק נקי ולא מספיק חד-משמעי.',
      safety_score: 'חשיפה בטיחותית גבוהה.',
      noise_score: 'רעש בינוני.',
      residue_risk_score: 'שאריות קונפיג קיימות.',
      reliability_score: 'רץ, אך חלק מהבסיס לא מאומת.'
    },
    weight: 'moderate',
    recommendation: 'manual review',
    needs_cleanup: true,
    needs_redesign: false,
    summary: 'שימושי, אבל לא מספיק מהודק ולא מספיק בטוח.'
  },
  'workspace-custom-systems': {
    scores: {
      architecture_score: 4.0,
      clarity_score: 3.5,
      runtime_weight_score: 4.5,
      resource_fit_score: 4.5,
      maintainability_score: 3.5,
      safety_score: 6.0,
      noise_score: 3.5,
      residue_risk_score: 3.0,
      reliability_score: 3.5
    },
    explanations: {
      architecture_score: 'זה לא ארכיטקטורה אחת ברורה אלא צבר פרויקטים.',
      clarity_score: 'הבהירות נמוכה.',
      runtime_weight_score: 'המשקל הכולל כבר מורגש.',
      resource_fit_score: 'מתאים חלקית בלבד למחשב זה.',
      maintainability_score: 'קשה לתחזק צבר כזה.',
      safety_score: 'לא זוהתה חשיפה כמו ברנטיימים, לכן מעט טוב יותר.',
      noise_score: 'רעש גבוה יחסית בגלל צבירה של ניסויים.',
      residue_risk_score: 'סיכון residue גבוה.',
      reliability_score: 'לא ברור מה פעיל ומה נטוש.'
    },
    weight: 'heavy',
    recommendation: 'needs cleanup',
    needs_cleanup: true,
    needs_redesign: true,
    summary: 'מעורבב מדי, כבד מדי, ולא מספיק ניהולי.'
  }
};

const enrichedSystems = rawSystems.map(system => {
  const input = reviewInputs[system.system_id];
  const overall = overallFrom(input.scores);
  return {
    system_id: system.system_id,
    name: system.name,
    display_name: system.display_name,
    owner: system.owner,
    purpose: system.purpose,
    status: system.status,
    overall_score: overall,
    overall_rating: grade(overall),
    weight: input.weight,
    recommendation: input.recommendation,
    needs_cleanup: input.needs_cleanup,
    needs_redesign: input.needs_redesign,
    last_checked: now,
    last_updated_if_known: system.last_updated_if_known,
    dashboard_link_if_exists: system.dashboard_link_if_exists,
    workspace_path: system.workspace_path,
    key_risks: uniq(system.key_risks),
    short_summary: input.summary,
    source_details: {
      related_ports: uniq(system.related_ports),
      related_tasks: uniq(system.related_tasks),
      related_cron_jobs: uniq(system.related_cron_jobs)
    }
  };
});

const systemsReview = enrichedSystems.map(system => {
  const input = reviewInputs[system.system_id];
  const scored = scoreCard(input.scores, input.explanations);
  return {
    system_id: system.system_id,
    display_name: system.display_name,
    owner: system.owner,
    status: system.status,
    overall_score: { score: system.overall_score, rating: system.overall_rating, explanation: 'ממוצע שמרני של מדדי הביקורת.' },
    weight: system.weight,
    recommendation: system.recommendation,
    needs_cleanup: system.needs_cleanup,
    needs_redesign: system.needs_redesign,
    last_checked: system.last_checked,
    last_updated_if_known: system.last_updated_if_known,
    dashboard_link_if_exists: system.dashboard_link_if_exists,
    workspace_path: system.workspace_path,
    key_risks: system.key_risks,
    short_summary: system.short_summary,
    scores: scored
  };
});

const systemsJson = {
  generated_at: now,
  scan_scope: ['C:\\Users\\Itzhak', 'C:\\Users\\Openclaw'],
  systems: enrichedSystems,
  residue_summary: {
    config_backup_indicators: [
      'Itzhak: openclaw.json.bak, .bak.1-.bak.4, multiple .clobbered snapshots',
      'Openclaw: openclaw.json.bak, .bak.1-.bak.4, multiple .clobbered snapshots'
    ],
    stale_or_missing_model_refs: ['Openclaw fallback model ollama/gemma4:e2b not confirmed in running Ollama process list'],
    stale_tasks: uniq(openTasks.filter(t => t.State !== 4).map(t => t.TaskName)),
    stale_logs_candidates: uniq(logPaths.filter(p => /commands\.log|audit/i.test(p))).slice(0, 20),
    old_workspaces_or_wrappers: uniq(customWorkspaceHits.filter(p => /backup-manager|smoke-test-build/i.test(p)))
  }
};

const systemsReviewJson = {
  generated_at: now,
  reviews: systemsReview
};

const dashboardData = {
  generated_at: now,
  summary: {
    total_systems: enrichedSystems.length,
    heavy_systems: enrichedSystems.filter(s => ['heavy', 'abusive'].includes(s.weight)).length,
    needs_cleanup: enrichedSystems.filter(s => s.needs_cleanup).length,
    closest_to_10_count: enrichedSystems.filter(s => s.overall_score >= 7.5).length
  },
  top_priorities: enrichedSystems.filter(s => s.needs_cleanup || s.needs_redesign || s.status !== 'active').map(s => s.display_name),
  top_heavy_systems: enrichedSystems.filter(s => ['heavy', 'abusive'].includes(s.weight)).map(s => s.display_name),
  systems_needing_cleanup: enrichedSystems.filter(s => s.needs_cleanup).map(s => s.display_name),
  systems_needing_redesign: enrichedSystems.filter(s => s.needs_redesign).map(s => s.display_name),
  closest_to_10: [...enrichedSystems].sort((a,b) => b.overall_score - a.overall_score).slice(0,3).map(s => ({ display_name: s.display_name, overall_score: s.overall_score })),
  systems: enrichedSystems
};

fs.writeFileSync(path.join(outputDir, 'systems.json'), JSON.stringify(systemsJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'systems_review.json'), JSON.stringify(systemsReviewJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'dashboard-data.json'), JSON.stringify(dashboardData, null, 2), 'utf8');

const lines = [];
lines.push('# SYSTEM_MAP', '');
lines.push('מיפוי, ביקורת ודירוג שמרני של מערכות OpenClaw והמערכות הקשורות שנמצאו תחת Itzhak ו-Openclaw. הסריקה הייתה לקריאה בלבד.', '');
lines.push('## תמונת מצב', '');
lines.push(`- מערכות שזוהו: ${enrichedSystems.length}`);
lines.push(`- מערכות כבדות: ${dashboardData.summary.heavy_systems}`);
lines.push(`- מערכות שדורשות ניקוי: ${dashboardData.summary.needs_cleanup}`);
lines.push(`- מערכות קרובות ל-10/10: ${dashboardData.summary.closest_to_10_count}`);
lines.push('');
for (const s of enrichedSystems) {
  const review = systemsReview.find(r => r.system_id === s.system_id);
  lines.push(`## ${s.display_name}`, '');
  lines.push(`- purpose: ${s.purpose}`);
  lines.push(`- owner: ${s.owner}`);
  lines.push(`- status: ${s.status}`);
  lines.push(`- overall_score: ${s.overall_score}/10 (${s.overall_rating})`);
  lines.push(`- weight: ${s.weight}`);
  lines.push(`- recommendation: ${s.recommendation}`);
  lines.push(`- needs_cleanup: ${s.needs_cleanup ? 'yes' : 'no'}`);
  lines.push(`- needs_redesign: ${s.needs_redesign ? 'yes' : 'no'}`);
  lines.push(`- last_checked: ${s.last_checked}`);
  lines.push(`- last_updated_if_known: ${s.last_updated_if_known}`);
  lines.push(`- dashboard_link_if_exists: ${s.dashboard_link_if_exists}`);
  lines.push(`- workspace_path: ${s.workspace_path}`);
  lines.push(`- key_risks: ${s.key_risks.join(', ') || 'unknown'}`);
  lines.push(`- short_summary: ${s.short_summary}`);
  lines.push(`- score_explanations: architecture=${review.scores.architecture_score.explanation}; clarity=${review.scores.clarity_score.explanation}; safety=${review.scores.safety_score.explanation}`);
  lines.push('');
}
lines.push('## Output Files', '');
lines.push(`- ${path.join(outputDir, 'SYSTEM_MAP.md')}`);
lines.push(`- ${path.join(outputDir, 'systems.json')}`);
lines.push(`- ${path.join(outputDir, 'systems_review.json')}`);
lines.push(`- ${path.join(outputDir, 'dashboard-data.json')}`);
lines.push(`- ${path.join(outputDir, 'dashboard.html')}`);
fs.writeFileSync(path.join(outputDir, 'SYSTEM_MAP.md'), lines.join('\n'), 'utf8');

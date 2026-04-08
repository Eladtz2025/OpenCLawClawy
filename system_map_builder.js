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

function scoreCard(values) {
  const scored = {};
  for (const [k, v] of Object.entries(values)) scored[k] = { score: v, rating: grade(v) };
  return scored;
}

function overallFrom(values) {
  const nums = Object.values(values).filter(v => typeof v === 'number');
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

const systems = [
  {
    system_id: 'openclaw-itzhak-main',
    name: 'OpenClaw Itzhak Main',
    user_owner: 'Itzhak',
    purpose: 'Primary OpenClaw runtime for Itzhak with Telegram access and local dashboard.',
    input_channels: ['telegram'],
    output_channels: ['telegram', 'dashboard'],
    bot_topic_group: {
      telegram_group_policy: itzhakCfg?.channels?.telegram?.groupPolicy,
      telegram_require_mention: itzhakCfg?.channels?.telegram?.groups?.['*']?.requireMention
    },
    related_workspace_path: itzhakCfg?.agents?.defaults?.workspace,
    related_config_paths: ['C:\\Users\\Itzhak\\.openclaw\\openclaw.json', 'C:\\ProgramData\\OpenClaw\\openclaw-Itzhak.cmd'],
    related_scripts_files: ['C:\\ProgramData\\OpenClaw\\openclaw-Itzhak.cmd', 'C:\\Users\\Itzhak\\AppData\\Roaming\\npm\\node_modules\\openclaw\\dist\\index.js'],
    related_scheduled_tasks: openTasks.filter(t => /Itzhak|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName),
    related_cron_jobs: cronPaths.filter(p => p.startsWith('C:\\Users\\Itzhak\\.openclaw\\cron')),
    related_ports: [...new Set([...(portsByPid[itzhakPid] || []), 18789, 18791])].sort((a,b)=>a-b),
    dependencies: ['Node.js', 'OpenAI Codex', 'Ollama', 'Telegram Bot API', 'browser plugin'],
    browser_used: !!itzhakCfg?.browser?.enabled,
    telegram_used: true,
    whatsapp_used: false,
    model_fallback_exists: !!itzhakCfg?.agents?.defaults?.model?.fallbacks?.length,
    status: 'active',
    last_known_activity: itzhakCfg?.meta?.lastTouchedAt || null,
    risk_level: 'high',
    estimated_weight: 'moderate',
    components: ['gateway', 'telegram channel', 'browser tooling', 'cron store', 'workspace', 'memory store'],
    residue_or_duplicates: ['multiple openclaw.json.clobbered backups', 'config backup chain (.bak*)', 'possible stale logs/backups'],
    manual_check_required: true,
    manual_check_reason: 'Security posture is open groupPolicy with full exec and elevated tools.'
  },
  {
    system_id: 'openclaw-openclaw-main',
    name: 'OpenClaw Openclaw Main',
    user_owner: 'Openclaw',
    purpose: 'Secondary OpenClaw runtime for Openclaw user with its own Telegram bot and local dashboard.',
    input_channels: ['telegram'],
    output_channels: ['telegram', 'dashboard'],
    bot_topic_group: {
      telegram_group_policy: openclawCfg?.channels?.telegram?.groupPolicy,
      telegram_require_mention: openclawCfg?.channels?.telegram?.groups?.['*']?.requireMention
    },
    related_workspace_path: openclawCfg?.agents?.defaults?.workspace,
    related_config_paths: ['C:\\Users\\Openclaw\\.openclaw\\openclaw.json', 'C:\\ProgramData\\OpenClaw\\openclaw-Openclaw.cmd'],
    related_scripts_files: ['C:\\ProgramData\\OpenClaw\\openclaw-Openclaw.cmd', 'C:\\Users\\Openclaw\\AppData\\Roaming\\npm\\node_modules\\openclaw\\dist\\index.js'],
    related_scheduled_tasks: openTasks.filter(t => /Openclaw|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName),
    related_cron_jobs: cronPaths.filter(p => p.startsWith('C:\\Users\\Openclaw\\.openclaw\\cron')),
    related_ports: [...new Set([...(portsByPid[openclawPid] || []), 18790, 18792])].sort((a,b)=>a-b),
    dependencies: ['Node.js', 'OpenAI Codex', 'Ollama fallback', 'Telegram Bot API', 'browser plugin'],
    browser_used: !!openclawCfg?.browser?.enabled,
    telegram_used: true,
    whatsapp_used: false,
    model_fallback_exists: !!openclawCfg?.agents?.defaults?.model?.fallbacks?.length,
    status: 'active',
    last_known_activity: openclawCfg?.meta?.lastTouchedAt || null,
    risk_level: 'high',
    estimated_weight: 'moderate',
    components: ['gateway', 'telegram channel', 'browser tooling', 'workspace', 'memory store'],
    residue_or_duplicates: ['multiple openclaw.json.clobbered backups', 'config backup chain (.bak*)'],
    manual_check_required: true,
    manual_check_reason: 'Fallback model gemma4:e2b may require manual validation, and groupPolicy is open with full exec.'
  },
  {
    system_id: 'workspace-custom-systems',
    name: 'Workspace Custom Systems Cluster',
    user_owner: 'Itzhak',
    purpose: 'Collection of custom-built systems found in the Itzhak OpenClaw workspace.',
    input_channels: ['file-based', 'possibly telegram for news-dashboard'],
    output_channels: ['files', 'possible telegram artifacts'],
    bot_topic_group: {},
    related_workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace',
    related_config_paths: [],
    related_scripts_files: customWorkspaceHits,
    related_scheduled_tasks: [],
    related_cron_jobs: [],
    related_ports: [],
    dependencies: ['workspace files', 'project-specific scripts'],
    browser_used: false,
    telegram_used: true,
    whatsapp_used: false,
    model_fallback_exists: false,
    status: 'unknown',
    last_known_activity: null,
    risk_level: 'medium',
    estimated_weight: 'heavy',
    components: ['news-dashboard', 'image-team', 'backup-manager residue', 'smoke-test-build'],
    residue_or_duplicates: ['deleted backup-manager tracked files in git status', 'deleted image-team run artifacts in git status', 'multiple experimental folders'],
    manual_check_required: true,
    manual_check_reason: 'Requires owner review to separate active projects from residue.'
  }
];

const reviews = {
  'openclaw-itzhak-main': {
    architecture_score: 6.5,
    clarity_score: 6.0,
    runtime_weight_score: 6.5,
    resource_fit_score: 7.0,
    maintainability_score: 5.5,
    safety_score: 2.5,
    noise_score: 5.5,
    residue_risk_score: 4.5,
    reliability_score: 7.5,
    weight_assessment: 'moderate',
    built_correctly: 'acceptable',
    too_complex: false,
    too_heavy: false,
    too_noisy: false,
    leaves_residue: true,
    needs_refactor: true,
    fits_this_machine: 'yes',
    recommendation: 'improve later',
    notes: 'רץ בפועל ונראה יציב, אבל החשיפה לקבוצת טלגרם פתוחה עם exec מלא פוגעת קשות בבטיחות ובתחזוקתיות.'
  },
  'openclaw-openclaw-main': {
    architecture_score: 6.0,
    clarity_score: 5.5,
    runtime_weight_score: 6.5,
    resource_fit_score: 6.5,
    maintainability_score: 5.0,
    safety_score: 2.5,
    noise_score: 5.5,
    residue_risk_score: 4.5,
    reliability_score: 7.0,
    weight_assessment: 'moderate',
    built_correctly: 'acceptable',
    too_complex: false,
    too_heavy: false,
    too_noisy: false,
    leaves_residue: true,
    needs_refactor: true,
    fits_this_machine: 'yes',
    recommendation: 'manual review',
    notes: 'גם כאן הריצה פעילה, אבל יש חוסר בהירות סביב fallback model וחשיפת exec מלאה בקבוצות.'
  },
  'workspace-custom-systems': {
    architecture_score: 4.0,
    clarity_score: 3.5,
    runtime_weight_score: 4.5,
    resource_fit_score: 4.5,
    maintainability_score: 3.5,
    safety_score: 6.0,
    noise_score: 3.5,
    residue_risk_score: 3.0,
    reliability_score: 3.5,
    weight_assessment: 'heavy',
    built_correctly: 'weak',
    too_complex: true,
    too_heavy: true,
    too_noisy: true,
    leaves_residue: true,
    needs_refactor: true,
    fits_this_machine: 'partial',
    recommendation: 'needs cleanup',
    notes: 'זה אוסף פרויקטים ולא מערכת אחת נקייה. יש שאריות ב-git status וחוסר הפרדה ברור בין פעיל, ניסיוני ונטוש.'
  }
};

const enrichedSystems = systems.map(system => {
  const review = reviews[system.system_id];
  const numeric = {
    architecture_score: review.architecture_score,
    clarity_score: review.clarity_score,
    runtime_weight_score: review.runtime_weight_score,
    resource_fit_score: review.resource_fit_score,
    maintainability_score: review.maintainability_score,
    safety_score: review.safety_score,
    noise_score: review.noise_score,
    residue_risk_score: review.residue_risk_score,
    reliability_score: review.reliability_score
  };
  const overall = overallFrom(numeric);
  return {
    ...system,
    review: {
      scores: {
        ...scoreCard(numeric),
        overall_score: { score: overall, rating: grade(overall) }
      },
      weight_assessment: review.weight_assessment,
      built_correctly: review.built_correctly,
      too_complex: review.too_complex,
      too_heavy: review.too_heavy,
      too_noisy: review.too_noisy,
      leaves_residue: review.leaves_residue,
      needs_refactor: review.needs_refactor,
      fits_this_machine: review.fits_this_machine,
      recommendation: review.recommendation,
      notes: review.notes
    }
  };
});

const residue = {
  config_backup_indicators: [
    'Itzhak: openclaw.json.bak, .bak.1-.bak.4, multiple .clobbered snapshots',
    'Openclaw: openclaw.json.bak, .bak.1-.bak.4, multiple .clobbered snapshots'
  ],
  stale_or_missing_model_refs: ['Openclaw fallback model ollama/gemma4:e2b not confirmed in running Ollama process list'],
  stale_tasks: openTasks.filter(t => t.State !== 4).map(t => t.TaskName),
  stale_logs_candidates: logPaths.filter(p => /commands\.log|audit/i.test(p)).slice(0, 20),
  old_workspaces_or_wrappers: customWorkspaceHits.filter(p => /backup-manager|smoke-test-build/i.test(p))
};

const systemsJson = {
  generated_at: new Date().toISOString(),
  scan_scope: ['C:\\Users\\Itzhak', 'C:\\Users\\Openclaw'],
  systems: enrichedSystems,
  residue_summary: residue
};

const systemsReviewJson = {
  generated_at: new Date().toISOString(),
  reviews: enrichedSystems.map(s => ({
    system_id: s.system_id,
    name: s.name,
    owner: s.user_owner,
    status: s.status,
    overall_score: s.review.scores.overall_score,
    weight_assessment: s.review.weight_assessment,
    recommendation: s.review.recommendation,
    fits_this_machine: s.review.fits_this_machine,
    notes: s.review.notes,
    scores: s.review.scores
  }))
};

const dashboard = {
  generated_at: new Date().toISOString(),
  systems: enrichedSystems.map(s => ({
    system_id: s.system_id,
    name: s.name,
    owner: s.user_owner,
    status: s.status,
    overall_score: s.review.scores.overall_score.score,
    overall_rating: s.review.scores.overall_score.rating,
    weight: s.review.weight_assessment,
    recommendation: s.review.recommendation
  })),
  top_heavy_systems: enrichedSystems.filter(s => ['heavy', 'abusive'].includes(s.review.weight_assessment)).map(s => s.name),
  systems_with_repeated_failures: enrichedSystems.filter(s => s.status !== 'active' || s.review.scores.reliability_score.score <= 4.5).map(s => s.name),
  systems_that_need_cleanup: enrichedSystems.filter(s => ['needs cleanup', 'archive'].includes(s.review.recommendation) || s.review.leaves_residue).map(s => s.name),
  closest_to_10: [...enrichedSystems].sort((a,b) => b.review.scores.overall_score.score - a.review.scores.overall_score.score).slice(0,3).map(s => ({ name: s.name, overall_score: s.review.scores.overall_score.score })),
  systems_needing_redesign: enrichedSystems.filter(s => ['needs redesign'].includes(s.review.recommendation) || s.review.too_complex).map(s => s.name)
};

fs.writeFileSync(path.join(outputDir, 'systems.json'), JSON.stringify(systemsJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'systems_review.json'), JSON.stringify(systemsReviewJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'dashboard-data.json'), JSON.stringify(dashboard, null, 2), 'utf8');

const lines = [];
lines.push('# SYSTEM_MAP', '');
lines.push('מיפוי, ביקורת ודירוג שמרני של מערכות OpenClaw והמערכות הקשורות שנמצאו תחת Itzhak ו-Openclaw. הסריקה הייתה לקריאה בלבד.', '');
lines.push('## תמונת מצב', '');
lines.push('- נמצאו 2 רנטיימים פעילים של OpenClaw, אחד לכל יוזר.');
lines.push('- נמצאו 2 Scheduled Tasks פעילים לשירותי Gateway ועוד משימת reconnect כללית.');
lines.push('- נמצאו פורטי Dashboard/Gateway פעילים: 18789, 18790, עם פורטים משויכים נוספים 18791, 18792.');
lines.push('- נמצאו שאריות קונפיג רבות: קבצי bak/clobbered בשני היוזרים.');
lines.push('- נמצאו פרויקטים מותאמים אישית ב-workspace של Itzhak שדורשים סיווג ידני בין active ל-residue.', '');
for (const s of enrichedSystems) {
  lines.push(`## ${s.name}`, '');
  lines.push(`- ייעוד: ${s.purpose}`);
  lines.push(`- בעלות: ${s.user_owner}`);
  lines.push(`- מצב: ${s.status}`);
  lines.push(`- איפה יושב: ${s.related_workspace_path || 'לא זוהה'}`);
  lines.push(`- ממה מורכב: ${s.components.join(', ')}`);
  const related = [];
  if (s.related_config_paths.length) related.push('configs: ' + s.related_config_paths.join(', '));
  if (s.related_scheduled_tasks.length) related.push('tasks: ' + s.related_scheduled_tasks.join(', '));
  if (s.related_ports.length) related.push('ports: ' + s.related_ports.join(', '));
  if (s.related_scripts_files.length) related.push('files: ' + s.related_scripts_files.slice(0, 6).join(', '));
  lines.push(`- מה קשור: ${related.length ? related.join(' | ') : 'לא זוהו קישורים נוספים מעבר לברירת המחדל'}`);
  lines.push(`- שאריות/כפילויות: ${s.residue_or_duplicates.length ? s.residue_or_duplicates.join('; ') : 'לא זוהו'}`);
  lines.push(`- נדרשת בדיקה ידנית: ${s.manual_check_required ? 'כן' : 'לא'}${s.manual_check_reason ? ' - ' + s.manual_check_reason : ''}`);
  lines.push(`- ציון כללי: ${s.review.scores.overall_score.score}/10 (${s.review.scores.overall_score.rating})`);
  lines.push(`- משקל על המחשב הזה: ${s.review.weight_assessment}`);
  lines.push(`- הערכה: בנויה ${s.review.built_correctly}, מסורבלת מדי: ${s.review.too_complex ? 'כן' : 'לא'}, כבדה מדי: ${s.review.too_heavy ? 'כן' : 'לא'}, רועשת מדי: ${s.review.too_noisy ? 'כן' : 'לא'}, משאירה residue: ${s.review.leaves_residue ? 'כן' : 'לא'}, צריכה refactor: ${s.review.needs_refactor ? 'כן' : 'לא'}, מתאימה למחשב: ${s.review.fits_this_machine}`);
  lines.push(`- המלצה: ${s.review.recommendation}`);
  lines.push(`- הערת ביקורת: ${s.review.notes}`, '');
}
lines.push('## Residue וסיכוני תחזוקה', '');
lines.push('- wrappers פעילים: C:\\ProgramData\\OpenClaw\\openclaw-Itzhak.cmd, C:\\ProgramData\\OpenClaw\\openclaw-Openclaw.cmd');
lines.push('- wrappers/refs ישנים אפשריים: OpenClaw - On Network Reconnect, backup-manager, smoke-test-build, image-team/runs שנמחקו ב-git status');
lines.push('- stale logs: commands.log וקבצי logs נוספים דורשים מדיניות רוטציה ידנית אם רוצים לצמצם משקל מקומי.');
lines.push('- stale model refs: ב-Openclaw מוגדר fallback gemma4:e2b, לא אומת כמודל זמין רץ כעת.');
lines.push('- stale backups refs: קיימים snapshotים רבים מסוג .bak ו-.clobbered בשני היוזרים.', '');
lines.push('## קבצי פלט', '');
lines.push(`- ${path.join(outputDir, 'SYSTEM_MAP.md')}`);
lines.push(`- ${path.join(outputDir, 'systems.json')}`);
lines.push(`- ${path.join(outputDir, 'systems_review.json')}`);
lines.push(`- ${path.join(outputDir, 'dashboard-data.json')}`);
fs.writeFileSync(path.join(outputDir, 'SYSTEM_MAP.md'), lines.join('\n'), 'utf8');

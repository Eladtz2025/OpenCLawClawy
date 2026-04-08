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
  for (const [k, v] of Object.entries(values)) scored[k] = { score: v, rating: grade(v), explanation: explanations[k] || 'unknown' };
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
    display_name: 'Main Bot, Itzhak',
    owner: 'Itzhak',
    purpose: 'Primary OpenClaw bot.',
    status: 'active',
    workspace_path: itzhakCfg?.agents?.defaults?.workspace || 'unknown',
    related_ports: uniq([...(portsByPid[itzhakPid] || []), 18789, 18791]).sort((a,b)=>a-b),
    related_tasks: uniq(openTasks.filter(t => /Itzhak|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName)),
    related_cron_jobs: uniq(cronPaths.filter(p => p.startsWith('C:\\Users\\Itzhak\\.openclaw\\cron'))),
    last_updated_if_known: itzhakCfg?.meta?.lastTouchedAt || 'unknown',
    dashboard_link_if_exists: publicDashboard,
    action_link: publicDashboard,
    key_risks: ['open group access', 'full exec', 'config residue'],
    short_summary: 'Stable, but too open.',
    estimated_weight: 'moderate'
  },
  {
    system_id: 'openclaw-openclaw-main',
    name: 'OpenClaw Openclaw Main',
    display_name: 'Main Bot, Openclaw',
    owner: 'Openclaw',
    purpose: 'Secondary OpenClaw bot.',
    status: 'active',
    workspace_path: openclawCfg?.agents?.defaults?.workspace || 'unknown',
    related_ports: uniq([...(portsByPid[openclawPid] || []), 18790, 18792]).sort((a,b)=>a-b),
    related_tasks: uniq(openTasks.filter(t => /Openclaw|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName)),
    related_cron_jobs: uniq(cronPaths.filter(p => p.startsWith('C:\\Users\\Openclaw\\.openclaw\\cron'))),
    last_updated_if_known: openclawCfg?.meta?.lastTouchedAt || 'unknown',
    dashboard_link_if_exists: publicDashboard,
    action_link: publicDashboard,
    key_risks: ['open group access', 'full exec', 'unverified fallback'],
    short_summary: 'Useful, but not tight enough.',
    estimated_weight: 'moderate'
  },
  {
    system_id: 'workspace-custom-systems',
    name: 'Workspace Custom Systems Cluster',
    display_name: 'Custom Projects Cluster',
    owner: 'Itzhak',
    purpose: 'Mixed custom workspace projects.',
    status: 'unknown',
    workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace',
    related_ports: [],
    related_tasks: [],
    related_cron_jobs: [],
    last_updated_if_known: 'unknown',
    dashboard_link_if_exists: 'unknown',
    action_link: 'unknown',
    key_risks: ['mixed active and stale work', 'git residue', 'unclear boundaries'],
    short_summary: 'Too mixed and too noisy.',
    estimated_weight: 'heavy'
  }
];

const reviewInputs = {
  'openclaw-itzhak-main': {
    scores: { architecture_score: 6.5, clarity_score: 6.0, runtime_weight_score: 6.5, resource_fit_score: 7.0, maintainability_score: 5.5, safety_score: 2.5, noise_score: 5.5, residue_risk_score: 4.5, reliability_score: 7.5 },
    explanations: { architecture_score: 'Reasonable structure, weak exposure control.', clarity_score: 'Understandable, but not clean enough.', runtime_weight_score: 'Runtime weight is fair.', resource_fit_score: 'Fits this machine well enough.', maintainability_score: 'Backup clutter hurts upkeep.', safety_score: 'Open group with full exec is unsafe.', noise_score: 'Moderate noise level.', residue_risk_score: 'Residual config clutter exists.', reliability_score: 'Running and appears stable.' },
    weight: 'moderate', recommendation: 'improve later', needs_cleanup: true, needs_redesign: false, summary: 'Works, but safety is weak.'
  },
  'openclaw-openclaw-main': {
    scores: { architecture_score: 6.0, clarity_score: 5.5, runtime_weight_score: 6.5, resource_fit_score: 6.5, maintainability_score: 5.0, safety_score: 2.5, noise_score: 5.5, residue_risk_score: 4.5, reliability_score: 7.0 },
    explanations: { architecture_score: 'Basic structure is okay.', clarity_score: 'Management clarity is only medium.', runtime_weight_score: 'Not too heavy.', resource_fit_score: 'Fair fit for this machine.', maintainability_score: 'Still not clean enough.', safety_score: 'Same unsafe exposure profile.', noise_score: 'Moderate noise.', residue_risk_score: 'Config residue remains.', reliability_score: 'Active, but parts are unverified.' },
    weight: 'moderate', recommendation: 'manual review', needs_cleanup: true, needs_redesign: false, summary: 'Usable, but needs review.'
  },
  'workspace-custom-systems': {
    scores: { architecture_score: 4.0, clarity_score: 3.5, runtime_weight_score: 4.5, resource_fit_score: 4.5, maintainability_score: 3.5, safety_score: 6.0, noise_score: 3.5, residue_risk_score: 3.0, reliability_score: 3.5 },
    explanations: { architecture_score: 'Not one clean architecture.', clarity_score: 'Low clarity.', runtime_weight_score: 'Heavy enough to matter.', resource_fit_score: 'Only partial fit.', maintainability_score: 'Hard to maintain as-is.', safety_score: 'Less exposed than the bots.', noise_score: 'Too noisy.', residue_risk_score: 'High residue risk.', reliability_score: 'Active state is unclear.' },
    weight: 'heavy', recommendation: 'needs cleanup', needs_cleanup: true, needs_redesign: true, summary: 'Messy and hard to manage.'
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
    action_link: system.action_link,
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
    overall_score: { score: system.overall_score, rating: system.overall_rating, explanation: 'Conservative average of review metrics.' },
    weight: system.weight,
    recommendation: system.recommendation,
    needs_cleanup: system.needs_cleanup,
    needs_redesign: system.needs_redesign,
    last_checked: system.last_checked,
    last_updated_if_known: system.last_updated_if_known,
    dashboard_link_if_exists: system.dashboard_link_if_exists,
    action_link: system.action_link,
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
    config_backup_indicators: ['Itzhak: many bak/clobbered snapshots', 'Openclaw: many bak/clobbered snapshots'],
    stale_or_missing_model_refs: ['Openclaw fallback model ollama/gemma4:e2b not confirmed in process scan'],
    stale_tasks: uniq(openTasks.filter(t => t.State !== 4).map(t => t.TaskName)),
    stale_logs_candidates: uniq(logPaths.filter(p => /commands\.log|audit/i.test(p))).slice(0, 20),
    old_workspaces_or_wrappers: uniq(customWorkspaceHits.filter(p => /backup-manager|smoke-test-build/i.test(p)))
  }
};

const systemsReviewJson = { generated_at: now, reviews: systemsReview };

const dashboardData = {
  generated_at: now,
  summary: {
    total_systems: enrichedSystems.length,
    heavy_systems: enrichedSystems.filter(s => ['heavy', 'abusive'].includes(s.weight)).length,
    needs_cleanup: enrichedSystems.filter(s => s.needs_cleanup).length,
    closest_to_10_count: enrichedSystems.filter(s => s.overall_score >= 7.5).length
  },
  top_priorities: uniq(enrichedSystems.filter(s => s.needs_cleanup || s.needs_redesign || s.status !== 'active').map(s => s.display_name)),
  requires_attention_now: uniq(enrichedSystems.filter(s => s.needs_redesign || s.status !== 'active' || s.weight === 'heavy' || s.weight === 'abusive').map(s => s.display_name)),
  top_heavy_systems: uniq(enrichedSystems.filter(s => ['heavy', 'abusive'].includes(s.weight)).map(s => s.display_name)),
  systems_needing_cleanup: uniq(enrichedSystems.filter(s => s.needs_cleanup).map(s => s.display_name)),
  systems_needing_redesign: uniq(enrichedSystems.filter(s => s.needs_redesign).map(s => s.display_name)),
  closest_to_10: [...enrichedSystems].sort((a,b) => b.overall_score - a.overall_score).slice(0,3).map(s => ({ display_name: s.display_name, overall_score: s.overall_score })),
  systems: enrichedSystems
};

fs.writeFileSync(path.join(outputDir, 'systems.json'), JSON.stringify(systemsJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'systems_review.json'), JSON.stringify(systemsReviewJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'dashboard-data.json'), JSON.stringify(dashboardData, null, 2), 'utf8');

const lines = [];
lines.push('# SYSTEM_MAP', '', 'Conservative mapping and review of detected OpenClaw systems.', '', '## Summary', '');
lines.push(`- Systems: ${enrichedSystems.length}`);
lines.push(`- Heavy: ${dashboardData.summary.heavy_systems}`);
lines.push(`- Needs cleanup: ${dashboardData.summary.needs_cleanup}`);
lines.push(`- Near 10/10: ${dashboardData.summary.closest_to_10_count}`, '');
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
  lines.push(`- action_link: ${s.action_link}`);
  lines.push(`- workspace_path: ${s.workspace_path}`);
  lines.push(`- key_risks: ${s.key_risks.join(', ') || 'unknown'}`);
  lines.push(`- short_summary: ${s.short_summary}`);
  lines.push(`- score_explanations: architecture=${review.scores.architecture_score.explanation}; clarity=${review.scores.clarity_score.explanation}; safety=${review.scores.safety_score.explanation}`, '');
}
lines.push('## Files', '');
lines.push(`- ${path.join(outputDir, 'SYSTEM_MAP.md')}`);
lines.push(`- ${path.join(outputDir, 'systems.json')}`);
lines.push(`- ${path.join(outputDir, 'systems_review.json')}`);
lines.push(`- ${path.join(outputDir, 'dashboard-data.json')}`);
lines.push(`- ${path.join(outputDir, 'dashboard.html')}`);
fs.writeFileSync(path.join(outputDir, 'SYSTEM_MAP.md'), lines.join('\n'), 'utf8');

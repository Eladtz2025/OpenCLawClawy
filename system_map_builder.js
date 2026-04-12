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
function overallFrom(values) {
  const nums = Object.values(values).filter(v => typeof v === 'number');
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
function scoreCard(values, explanations) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = { score: v, rating: grade(v), explanation: explanations[k] || 'unknown' };
  }
  return out;
}

const now = new Date().toISOString();
const publicDashboard = 'https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html';
const itzhakCfg = loadJson('C:\\Users\\Itzhak\\.openclaw\\openclaw.json') || {};
const openclawCfg = loadJson('C:\\Users\\Openclaw\\.openclaw\\openclaw.json') || {};
const cron = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'cron.json')) || [];
const logs = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'logs.json')) || [];
const tasks = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'scheduled_tasks.json')) || [];
const processes = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'processes.json')) || [];
const ports = loadJson(path.join(workspace, 'SYSTEM_MAP_DATA', 'ports.json')) || [];

const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const cronA = arr(cron), logsA = arr(logs), tasksA = arr(tasks), procA = arr(processes), portsA = arr(ports);

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
const logPaths = logsA.map(x => x.FullName).filter(Boolean);

const systemsSeed = [
  {
    system_id: 'runtime-clawy-itzhak', display_name: 'Clawy Runtime', name: 'OpenClaw Itzhak Main', owner: 'Itzhak', purpose: 'Primary OpenClaw runtime for Clawy.', status: 'active', workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace', last_updated_if_known: itzhakCfg?.meta?.lastTouchedAt || 'unknown', dashboard_link_if_exists: publicDashboard, action_link: publicDashboard, key_risks: ['open group access', 'full exec', 'config residue'], short_summary: 'Stable runtime, weak safety.', source_details: { related_ports: uniq([...(portsByPid[itzhakPid] || []), 18789, 18791]).sort((a,b)=>a-b), related_tasks: uniq(openTasks.filter(t => /Itzhak|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName)), related_cron_jobs: uniq(cronPaths.filter(p => p.startsWith('C:\\Users\\Itzhak\\.openclaw\\cron'))) }, review: { scores: { architecture_score: 6.5, clarity_score: 6.0, runtime_weight_score: 6.5, resource_fit_score: 7.0, maintainability_score: 5.5, safety_score: 2.5, noise_score: 5.5, residue_risk_score: 4.5, reliability_score: 7.5 }, explanations: { architecture_score: 'Reasonable structure, weak exposure control.', clarity_score: 'Understandable, but not clean enough.', runtime_weight_score: 'Runtime weight is fair.', resource_fit_score: 'Fits this machine well enough.', maintainability_score: 'Backup clutter hurts upkeep.', safety_score: 'Open group with full exec is unsafe.', noise_score: 'Moderate noise level.', residue_risk_score: 'Residual config clutter exists.', reliability_score: 'Running and appears stable.' }, weight: 'moderate', recommendation: 'improve later', needs_cleanup: true, needs_redesign: false }
  },
  {
    system_id: 'system-pc-guardian', display_name: 'PC Guardian', name: 'pc-guardian', owner: 'Itzhak', purpose: 'PC monitoring and guardian system.', status: 'unknown', workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace\\pc-guardian', last_updated_if_known: 'unknown', dashboard_link_if_exists: publicDashboard, action_link: publicDashboard, key_risks: ['scope not fully verified', 'needs clearer boundaries'], short_summary: 'Looks real, not fully verified yet.', source_details: { related_ports: [], related_tasks: [], related_cron_jobs: [] }, review: { scores: { architecture_score: 6.0, clarity_score: 6.0, runtime_weight_score: 7.0, resource_fit_score: 7.0, maintainability_score: 6.0, safety_score: 7.0, noise_score: 6.5, residue_risk_score: 6.0, reliability_score: 5.5 }, explanations: { architecture_score: 'Folder is clearly isolated.', clarity_score: 'Name and scope are readable.', runtime_weight_score: 'No evidence of heavy runtime.', resource_fit_score: 'Seems lightweight enough.', maintainability_score: 'Fairly maintainable by structure.', safety_score: 'No direct unsafe exposure found here.', noise_score: 'Not especially noisy.', residue_risk_score: 'Some uncertainty remains.', reliability_score: 'Activity not fully confirmed.' }, weight: 'light', recommendation: 'manual review', needs_cleanup: false, needs_redesign: false }
  },
  {
    system_id: 'system-system-map', display_name: 'System Map', name: 'system-map', owner: 'Itzhak', purpose: 'OpenClaw system mapping and review dashboard.', status: 'active', workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace\\system-map', last_updated_if_known: now, dashboard_link_if_exists: publicDashboard, action_link: publicDashboard, key_risks: ['mapping still evolving', 'depends on conservative inference'], short_summary: 'Active and useful, still being refined.', source_details: { related_ports: [], related_tasks: [], related_cron_jobs: [] }, review: { scores: { architecture_score: 7.0, clarity_score: 7.0, runtime_weight_score: 8.0, resource_fit_score: 8.0, maintainability_score: 7.0, safety_score: 8.0, noise_score: 7.5, residue_risk_score: 6.5, reliability_score: 6.5 }, explanations: { architecture_score: 'Simple local structure.', clarity_score: 'Readable model and output files.', runtime_weight_score: 'Very light runtime profile.', resource_fit_score: 'Good fit for this machine.', maintainability_score: 'Maintainable, but still evolving.', safety_score: 'Read-only style is safer.', noise_score: 'Low noise overall.', residue_risk_score: 'Some builder artifacts remain.', reliability_score: 'Useful, but current mapping was incomplete.' }, weight: 'light', recommendation: 'improve later', needs_cleanup: false, needs_redesign: false }
  },
  {
    system_id: 'system-news-editor', display_name: 'News Editor', name: 'news-dashboard', owner: 'Itzhak', purpose: 'News collection, editing and dashboarding system.', status: 'unknown', workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace\\news-dashboard', last_updated_if_known: 'unknown', dashboard_link_if_exists: 'unknown', action_link: 'unknown', key_risks: ['workflow not fully verified', 'possible residue from experiments'], short_summary: 'Clearly exists, but needs verification.', source_details: { related_ports: [], related_tasks: [], related_cron_jobs: [] }, review: { scores: { architecture_score: 5.5, clarity_score: 5.5, runtime_weight_score: 6.0, resource_fit_score: 6.5, maintainability_score: 5.0, safety_score: 7.0, noise_score: 5.0, residue_risk_score: 4.5, reliability_score: 5.0 }, explanations: { architecture_score: 'Seems project-based, not yet fully mapped.', clarity_score: 'Purpose is fairly clear from folder.', runtime_weight_score: 'Likely moderate at most.', resource_fit_score: 'Probably acceptable locally.', maintainability_score: 'Looks medium, not polished enough.', safety_score: 'No obvious unsafe exposure found.', noise_score: 'Some project noise likely exists.', residue_risk_score: 'Experiment residue is possible.', reliability_score: 'Operational state still unclear.' }, weight: 'moderate', recommendation: 'manual review', needs_cleanup: true, needs_redesign: false }
  },
  {
    system_id: 'system-image-generator', display_name: 'Image Generator', name: 'image-team', owner: 'Itzhak', purpose: 'Image generation workflow system.', status: 'unknown', workspace_path: 'C:\\Users\\Itzhak\\.openclaw\\workspace\\image-team', last_updated_if_known: 'unknown', dashboard_link_if_exists: 'unknown', action_link: 'unknown', key_risks: ['old run residue', 'unclear current activity'], short_summary: 'Looks useful, but residue is visible.', source_details: { related_ports: [], related_tasks: [], related_cron_jobs: [] }, review: { scores: { architecture_score: 5.5, clarity_score: 5.0, runtime_weight_score: 5.0, resource_fit_score: 5.0, maintainability_score: 4.5, safety_score: 7.0, noise_score: 4.5, residue_risk_score: 3.5, reliability_score: 4.5 }, explanations: { architecture_score: 'Project exists but not fully structured in current map.', clarity_score: 'Intent is visible, operation is not.', runtime_weight_score: 'Image systems can get heavier quickly.', resource_fit_score: 'Fit is only moderate without active validation.', maintainability_score: 'Residue hurts maintainability.', safety_score: 'No major exposure found.', noise_score: 'Run artifacts create noise.', residue_risk_score: 'Residue is clearly present.', reliability_score: 'Current live status is unclear.' }, weight: 'heavy', recommendation: 'needs cleanup', needs_cleanup: true, needs_redesign: false }
  },
  {
    system_id: 'runtime-pinch-openclaw', display_name: 'Pinch Runtime', name: 'OpenClaw Openclaw Main', owner: 'Openclaw', purpose: 'Primary OpenClaw runtime for Pinch.', status: 'active', workspace_path: 'C:\\Users\\Openclaw\\.openclaw\\workspace', last_updated_if_known: openclawCfg?.meta?.lastTouchedAt || 'unknown', dashboard_link_if_exists: publicDashboard, action_link: publicDashboard, key_risks: ['open group access', 'full exec', 'unverified fallback'], short_summary: 'Usable runtime, but safety needs work.', source_details: { related_ports: uniq([...(portsByPid[openclawPid] || []), 18790, 18792]).sort((a,b)=>a-b), related_tasks: uniq(openTasks.filter(t => /Openclaw|On Network Reconnect/i.test(t.TaskName || '')).map(t => t.TaskName)), related_cron_jobs: uniq(cronPaths.filter(p => p.startsWith('C:\\Users\\Openclaw\\.openclaw\\cron'))) }, review: { scores: { architecture_score: 6.0, clarity_score: 5.5, runtime_weight_score: 6.5, resource_fit_score: 6.5, maintainability_score: 5.0, safety_score: 2.5, noise_score: 5.5, residue_risk_score: 4.5, reliability_score: 7.0 }, explanations: { architecture_score: 'Basic structure is okay.', clarity_score: 'Management clarity is only medium.', runtime_weight_score: 'Not too heavy.', resource_fit_score: 'Fair fit for this machine.', maintainability_score: 'Still not clean enough.', safety_score: 'Same unsafe exposure profile.', noise_score: 'Moderate noise.', residue_risk_score: 'Config residue remains.', reliability_score: 'Active, but parts are unverified.' }, weight: 'moderate', recommendation: 'manual review', needs_cleanup: true, needs_redesign: false }
  },
  {
    system_id: 'system-transcribe', display_name: 'Transcribe', name: 'transcription-team', owner: 'Openclaw', purpose: 'Transcription workflow system.', status: 'unknown', workspace_path: 'C:\\Users\\Openclaw\\.openclaw\\workspace\\transcription-team', last_updated_if_known: 'unknown', dashboard_link_if_exists: 'unknown', action_link: 'unknown', key_risks: ['workflow not verified', 'possible stale outputs'], short_summary: 'Present, but needs verification.', source_details: { related_ports: [], related_tasks: [], related_cron_jobs: [] }, review: { scores: { architecture_score: 6.0, clarity_score: 6.0, runtime_weight_score: 6.5, resource_fit_score: 6.5, maintainability_score: 5.5, safety_score: 7.0, noise_score: 5.5, residue_risk_score: 5.0, reliability_score: 5.0 }, explanations: { architecture_score: 'Folder is isolated enough.', clarity_score: 'Purpose is readable.', runtime_weight_score: 'Likely moderate.', resource_fit_score: 'Probably okay for this machine.', maintainability_score: 'Needs validation, not yet strong.', safety_score: 'No direct unsafe exposure found.', noise_score: 'Probably moderate.', residue_risk_score: 'Some stale outputs may exist.', reliability_score: 'Live state not confirmed.' }, weight: 'moderate', recommendation: 'manual review', needs_cleanup: false, needs_redesign: false }
  },
  {
    system_id: 'system-posts-social', display_name: 'Posts, Facebook and Instagram', name: 'video-editor-team', owner: 'Openclaw', purpose: 'Social posts production workflow, likely for Facebook and Instagram.', status: 'unknown', workspace_path: 'C:\\Users\\Openclaw\\.openclaw\\workspace\\video-editor-team', last_updated_if_known: 'unknown', dashboard_link_if_exists: 'unknown', action_link: 'unknown', key_risks: ['exact scope inferred conservatively', 'workflow not verified'], short_summary: 'Likely social content pipeline, still needs confirmation.', source_details: { related_ports: [], related_tasks: [], related_cron_jobs: [] }, review: { scores: { architecture_score: 5.5, clarity_score: 4.5, runtime_weight_score: 5.5, resource_fit_score: 5.5, maintainability_score: 5.0, safety_score: 7.0, noise_score: 5.0, residue_risk_score: 5.0, reliability_score: 4.5 }, explanations: { architecture_score: 'Project exists, but mapping is still inferred.', clarity_score: 'Name does not fully match the business label.', runtime_weight_score: 'Probably moderate.', resource_fit_score: 'Acceptable, but unverified.', maintainability_score: 'Medium at best until verified.', safety_score: 'No obvious unsafe exposure found.', noise_score: 'Moderate.', residue_risk_score: 'Some project residue may exist.', reliability_score: 'Operational state remains unclear.' }, weight: 'moderate', recommendation: 'manual review', needs_cleanup: false, needs_redesign: true }
  }
];

const systems = systemsSeed.map(s => {
  const overall = overallFrom(s.review.scores);
  return {
    system_id: s.system_id,
    name: s.name,
    display_name: s.display_name,
    owner: s.owner,
    purpose: s.purpose,
    status: s.status,
    overall_score: overall,
    overall_rating: grade(overall),
    weight: s.review.weight,
    recommendation: s.review.recommendation,
    needs_cleanup: s.review.needs_cleanup,
    needs_redesign: s.review.needs_redesign,
    last_checked: now,
    last_updated_if_known: s.last_updated_if_known,
    dashboard_link_if_exists: s.dashboard_link_if_exists,
    action_link: s.action_link,
    workspace_path: s.workspace_path,
    key_risks: uniq(s.key_risks),
    short_summary: s.short_summary,
    source_details: s.source_details
  };
});

const reviews = systemsSeed.map(s => {
  const overall = overallFrom(s.review.scores);
  return {
    system_id: s.system_id,
    display_name: s.display_name,
    owner: s.owner,
    status: s.status,
    overall_score: { score: overall, rating: grade(overall), explanation: 'Conservative average of review metrics.' },
    weight: s.review.weight,
    recommendation: s.review.recommendation,
    needs_cleanup: s.review.needs_cleanup,
    needs_redesign: s.review.needs_redesign,
    last_checked: now,
    last_updated_if_known: s.last_updated_if_known,
    dashboard_link_if_exists: s.dashboard_link_if_exists,
    action_link: s.action_link,
    workspace_path: s.workspace_path,
    key_risks: uniq(s.key_risks),
    short_summary: s.short_summary,
    scores: scoreCard(s.review.scores, s.review.explanations)
  };
});

const systemsJson = {
  generated_at: now,
  scan_scope: ['C:\\Users\\Itzhak', 'C:\\Users\\Openclaw'],
  systems,
  residue_summary: {
    config_backup_indicators: ['Itzhak: many bak/clobbered snapshots', 'Openclaw: many bak/clobbered snapshots'],
    stale_or_missing_model_refs: ['Openclaw fallback model ollama/gemma4:e2b not confirmed in process scan'],
    stale_tasks: uniq(openTasks.filter(t => t.State !== 4).map(t => t.TaskName)),
    stale_logs_candidates: uniq(logPaths.filter(p => /commands\.log|audit/i.test(p))).slice(0, 20)
  }
};
const systemsReviewJson = { generated_at: now, reviews };
const dashboardData = {
  generated_at: now,
  summary: {
    total_systems: systems.length,
    heavy_systems: systems.filter(s => ['heavy', 'abusive'].includes(s.weight)).length,
    needs_cleanup: systems.filter(s => s.needs_cleanup).length,
    closest_to_10_count: systems.filter(s => s.overall_score >= 7.5).length
  },
  top_priorities: uniq(systems.filter(s => s.needs_cleanup || s.needs_redesign || s.status !== 'active').map(s => s.display_name)),
  requires_attention_now: uniq(systems.filter(s => s.needs_redesign || s.status !== 'active' || ['heavy','abusive'].includes(s.weight)).map(s => s.display_name)),
  top_heavy_systems: uniq(systems.filter(s => ['heavy','abusive'].includes(s.weight)).map(s => s.display_name)),
  systems_needing_cleanup: uniq(systems.filter(s => s.needs_cleanup).map(s => s.display_name)),
  systems_needing_redesign: uniq(systems.filter(s => s.needs_redesign).map(s => s.display_name)),
  closest_to_10: [...systems].sort((a,b)=>b.overall_score-a.overall_score).slice(0,3).map(s => ({ display_name: s.display_name, overall_score: s.overall_score })),
  systems
};

fs.writeFileSync(path.join(outputDir, 'systems.json'), JSON.stringify(systemsJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'systems_review.json'), JSON.stringify(systemsReviewJson, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'dashboard-data.json'), JSON.stringify(dashboardData, null, 2), 'utf8');

const lines = [];
lines.push('# SYSTEM_MAP', '', 'Professional, conservative mapping and review of detected OpenClaw systems.', '', '## Summary', '');
lines.push(`- Systems: ${systems.length}`);
lines.push(`- Heavy: ${dashboardData.summary.heavy_systems}`);
lines.push(`- Needs cleanup: ${dashboardData.summary.needs_cleanup}`);
lines.push(`- Near 10/10: ${dashboardData.summary.closest_to_10_count}`, '');
for (const s of systems) {
  const r = reviews.find(x => x.system_id === s.system_id);
  lines.push(`## ${s.display_name}`, '');
  lines.push(`- owner: ${s.owner}`);
  lines.push(`- purpose: ${s.purpose}`);
  lines.push(`- status: ${s.status}`);
  lines.push(`- overall_score: ${s.overall_score}/10 (${s.overall_rating})`);
  lines.push(`- weight: ${s.weight}`);
  lines.push(`- recommendation: ${s.recommendation}`);
  lines.push(`- needs_cleanup: ${s.needs_cleanup ? 'yes' : 'no'}`);
  lines.push(`- needs_redesign: ${s.needs_redesign ? 'yes' : 'no'}`);
  lines.push(`- workspace_path: ${s.workspace_path}`);
  lines.push(`- action_link: ${s.action_link}`);
  lines.push(`- short_summary: ${s.short_summary}`);
  lines.push(`- key_risks: ${s.key_risks.join(', ') || 'unknown'}`);
  lines.push(`- score_explanations: architecture=${r.scores.architecture_score.explanation}; clarity=${r.scores.clarity_score.explanation}; safety=${r.scores.safety_score.explanation}`, '');
}
fs.writeFileSync(path.join(outputDir, 'SYSTEM_MAP.md'), lines.join('\n'), 'utf8');

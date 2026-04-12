const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'state', 'state.json');
const DASHBOARD_FILE = path.join(ROOT, 'dashboard', 'data.json');
const OUT_DIR = path.join(ROOT, 'state', 'investigations');

fs.mkdirSync(OUT_DIR, { recursive: true });

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const dashboard = fs.existsSync(DASHBOARD_FILE) ? JSON.parse(fs.readFileSync(DASHBOARD_FILE, 'utf8')) : {};
const now = new Date().toISOString();

const failures = Array.isArray(dashboard.recent_failures) ? dashboard.recent_failures.slice(0, 5) : [];
const insights = Array.isArray(dashboard.insights) ? dashboard.insights.slice(0, 5) : [];

function correlate(failure, insight) {
  return {
    kind: failure?.kind || 'Unknown',
    summary: failure?.summary || '',
    severity: insight?.insight?.severity || failure?.status || 'WARNING',
    confidence: insight?.insight?.confidence || 'medium',
    impact: insight?.insight?.impact || 'Unknown impact',
    next: insight?.insight?.next || 'Review manually'
  };
}

const correlated = failures.map((f, i) => correlate(f, insights[i]));
const actionable = correlated.filter(x => x.severity === 'CRITICAL' || x.confidence === 'high');

const report = {
  generated_at: now,
  system_name: dashboard.system_name || state.system_name || 'PC Guardian',
  overall_status: dashboard.overall_status || state.overall_status || 'UNKNOWN',
  triggered: actionable.length > 0,
  incidents: correlated,
  recommendations: actionable.length
    ? actionable.map(x => ({ title: x.kind, next: x.next, reason: x.impact }))
    : [{ title: 'No escalation', next: 'No subagent escalation needed', reason: 'No high-confidence critical incident found' }]
};

const file = path.join(OUT_DIR, 'investigation-' + now.replace(/[:.]/g, '-') + '.json');
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ ok: true, file, triggered: report.triggered, incidents: correlated.length, actionable: actionable.length }, null, 2));
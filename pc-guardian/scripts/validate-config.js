const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'config', 'config.json');
const rulesPath = path.join(ROOT, 'config', 'rules.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${file}: ${error.message}`);
  }
}

const config = readJson(configPath);
const rules = readJson(rulesPath);

if (config.mode !== 'reporting-only') fail('config.mode must be reporting-only');
if (!config.monitoring || !Array.isArray(config.monitoring.connectivity_targets) || !config.monitoring.connectivity_targets.length) fail('monitoring.connectivity_targets is required');
if (!Array.isArray(config.monitoring.internet_targets)) fail('monitoring.internet_targets must be an array');
if (!config.openclaw || !Array.isArray(config.openclaw.gateways)) fail('openclaw.gateways must be an array');
if (!config.paths || !config.paths.state_file || !config.paths.dashboard_data_file || !config.paths.dashboard_file) fail('paths are incomplete');
if (!rules.policy || rules.policy.mode !== 'reporting-only') fail('rules.policy.mode must be reporting-only');
if (rules.policy.allow_automatic_actions !== false) fail('rules.policy.allow_automatic_actions must be false');
if (!Array.isArray(rules.important_ports)) fail('rules.important_ports must be an array');

console.log('PC Guardian config validation passed');

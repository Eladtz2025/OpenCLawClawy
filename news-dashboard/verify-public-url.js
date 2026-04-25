const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const STATE_PATH = path.join(ROOT, 'state.json');
const SUMMARY_PATH = path.join(ROOT, 'telegram-summary.txt');
const ALERT_PATH = path.join(ROOT, 'telegram-alert.txt');

function fail(message) {
  fs.writeFileSync(ALERT_PATH, message, 'utf8');
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function fetchUrl(url) {
  return execFileSync('curl.exe', ['-L', '--silent', '--show-error', '--fail', url], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const publicUrl = state.publicUrl;
const today = new Date().toISOString().slice(0, 10);
const expectedBuildId = state.buildId;

if (!publicUrl) fail('Public URL missing from state.json');

let body;
let checkedUrl = publicUrl;
try {
  body = fetchUrl(publicUrl);
} catch (error) {
  const fallbackUrl = state.publicLatestUrl;
  if (!fallbackUrl) fail(`Public news page not reachable yet: ${publicUrl}`);
  try {
    const latestBody = fetchUrl(fallbackUrl);
    const redirectMatch = latestBody.match(/url=\.\/([0-9]{4}-[0-9]{2}-[0-9]{2}\.html\?v=[^"' >]+)/i);
    if (!redirectMatch) fail(`Public latest page reachable but does not point to a dated build: ${fallbackUrl}`);
    checkedUrl = `${fallbackUrl.replace(/latest\.html.*$/i, '')}${redirectMatch[1]}`;
    body = fetchUrl(checkedUrl);
  } catch (fallbackError) {
    fail(`Public news page not reachable yet: ${publicUrl}`);
  }
}

if (!body.includes(expectedBuildId)) fail(`Public page reachable but missing expected buildId ${expectedBuildId}`);
if (!body.includes(`חדשות הבוקר - ${today}`)) fail(`Public page reachable but not updated for ${today}`);

const telegramText = `בוקר טוב\n${checkedUrl}`;
fs.writeFileSync(SUMMARY_PATH, telegramText, 'utf8');
fs.writeFileSync(ALERT_PATH, '', 'utf8');
process.stdout.write(JSON.stringify({ ok: true, publicUrl: checkedUrl, buildId: expectedBuildId }, null, 2));

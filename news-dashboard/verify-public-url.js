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
  return execFileSync('curl.exe', ['-L', '--silent', '--show-error', '--fail', '--max-time', '30', url], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const publicUrl = state.publicUrl;
const publicLatestUrl = state.publicLatestUrl;
const today = new Date().toISOString().slice(0, 10);
const expectedBuildId = state.buildId;

if (!publicUrl) fail('Public URL missing from state.json');
if (!publicLatestUrl) fail('Public latest URL missing from state.json');

let latestBody;
try {
  latestBody = fetchUrl(publicLatestUrl);
} catch (error) {
  fail(`Public latest page not reachable yet: ${publicLatestUrl}`);
}

const redirectMatch = latestBody.match(/url=\.\/([0-9]{4}-[0-9]{2}-[0-9]{2}\.html\?v=[^"' >]+)/i);
if (!redirectMatch) fail(`Public latest page reachable but does not point to a dated build: ${publicLatestUrl}`);
const checkedUrl = `${publicLatestUrl.replace(/latest\.html.*$/i, '')}${redirectMatch[1]}`;

let body;
try {
  body = fetchUrl(checkedUrl);
} catch (error) {
  fail(`Public dated news page not reachable yet: ${checkedUrl}`);
}

if (!latestBody.includes(expectedBuildId)) fail(`Public latest page reachable but missing expected buildId ${expectedBuildId}`);
if (!body.includes(expectedBuildId)) fail(`Public page reachable but missing expected buildId ${expectedBuildId}`);
if (!body.includes(`חדשות הבוקר - ${today}`)) fail(`Public page reachable but not updated for ${today}`);

const telegramText = `בוקר טוב\n${publicLatestUrl}`;
fs.writeFileSync(SUMMARY_PATH, telegramText, 'utf8');
fs.writeFileSync(ALERT_PATH, '', 'utf8');
process.stdout.write(JSON.stringify({ ok: true, publicUrl: publicLatestUrl, resolvedUrl: checkedUrl, buildId: expectedBuildId }, null, 2));

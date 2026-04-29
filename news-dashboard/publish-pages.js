const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS_DIR = __dirname;
const STATE_PATH = path.join(NEWS_DIR, 'state.json');
const ALERT_PATH = path.join(NEWS_DIR, 'telegram-alert.txt');
const REMOTE = 'origin';
const BRANCH = 'main';
const MAX_PAGES_WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 15000;

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function fail(message, code = 1) {
  fs.writeFileSync(ALERT_PATH, String(message || '').trim(), 'utf8');
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function sleep(ms) {
  execFileSync('powershell', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`], { stdio: 'ignore' });
}

function safeTrim(text) {
  return String(text || '').trim();
}

function readState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function getHeadSha(ref = 'HEAD') {
  return safeTrim(exec('git', ['rev-parse', ref]));
}

function getRemoteSha() {
  const output = safeTrim(exec('git', ['ls-remote', REMOTE, `refs/heads/${BRANCH}`]));
  return output ? output.split(/\s+/)[0] : '';
}

function ensureCleanPublishSet() {
  const status = exec('git', ['status', '--porcelain', '--', 'news-dashboard', '.github/workflows/pages.yml']);
  const lines = status.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const disallowed = lines.filter(line => !line.includes('news-dashboard') && !line.includes('.github/workflows/pages.yml'));
  if (disallowed.length > 0) {
    fail(`Publish aborted, unrelated tracked changes present: ${disallowed.join(', ')}`);
  }
}

function stagePublishFiles() {
  const addResult = run('git', ['add', '--', 'news-dashboard', '.github/workflows/pages.yml']);
  if (addResult.status !== 0) {
    fail(safeTrim(addResult.stderr) || 'git add failed', addResult.status || 1);
  }
}

function commitIfNeeded(buildId) {
  const cached = exec('git', ['diff', '--cached', '--name-only', '--', 'news-dashboard', '.github/workflows/pages.yml']);
  const files = cached.split(/\r?\n/).map(safeTrim).filter(Boolean);
  if (files.length === 0) {
    return { committed: false, sha: getHeadSha('HEAD') };
  }

  const commitMessage = `Publish news dashboard ${buildId}`;
  const commitResult = run('git', ['commit', '-m', commitMessage]);
  if (commitResult.status !== 0) {
    fail(safeTrim(commitResult.stderr) || safeTrim(commitResult.stdout) || 'git commit failed', commitResult.status || 1);
  }
  if (commitResult.stdout) process.stdout.write(commitResult.stdout);
  if (commitResult.stderr) process.stderr.write(commitResult.stderr);
  return { committed: true, sha: getHeadSha('HEAD') };
}

function pushHead() {
  const pushResult = run('git', ['push', REMOTE, `HEAD:${BRANCH}`]);
  if (pushResult.stdout) process.stdout.write(pushResult.stdout);
  if (pushResult.stderr) process.stderr.write(pushResult.stderr);
  if (pushResult.status !== 0) {
    fail(safeTrim(pushResult.stderr) || 'git push failed', pushResult.status || 1);
  }
}

function fetchUrl(url) {
  return exec('curl.exe', ['-L', '--silent', '--show-error', '--fail', url]);
}

function waitForPublicBuild(state) {
  const deadline = Date.now() + MAX_PAGES_WAIT_MS;
  let lastError = 'Timed out waiting for GitHub Pages update';
  while (Date.now() < deadline) {
    try {
      const latestBody = fetchUrl(state.publicLatestUrl);
      if (!latestBody.includes(state.buildId)) {
        lastError = `Public latest page still missing buildId ${state.buildId}`;
        sleep(POLL_MS);
        continue;
      }
      const redirectMatch = latestBody.match(/url=\.\/([0-9]{4}-[0-9]{2}-[0-9]{2}\.html\?v=[^"' >]+)/i);
      if (!redirectMatch) {
        lastError = 'Public latest page has no dated redirect yet';
        sleep(POLL_MS);
        continue;
      }
      const datedUrl = `${state.publicLatestUrl.replace(/latest\.html.*$/i, '')}${redirectMatch[1]}`;
      const body = fetchUrl(datedUrl);
      if (!body.includes(state.buildId)) {
        lastError = `Public dated page still missing buildId ${state.buildId}`;
        sleep(POLL_MS);
        continue;
      }
      return { ok: true, datedUrl };
    } catch (error) {
      lastError = safeTrim(error.stderr || error.message || String(error));
      sleep(POLL_MS);
    }
  }
  fail(lastError);
}

function main() {
  if (!fs.existsSync(STATE_PATH)) fail('state.json missing before publish');
  ensureCleanPublishSet();
  const state = readState();
  if (!state.buildId) fail('buildId missing before publish');

  const localHead = getHeadSha('HEAD');
  const remoteHead = getRemoteSha();
  stagePublishFiles();
  const commitResult = commitIfNeeded(state.buildId);
  const headToPublish = commitResult.sha || localHead;

  if (remoteHead !== headToPublish) {
    pushHead();
  }

  const pushedRemote = getRemoteSha();
  if (pushedRemote !== headToPublish) {
    fail(`Remote head mismatch after push: expected ${headToPublish}, got ${pushedRemote || 'empty'}`);
  }

  const waitResult = waitForPublicBuild(state);
  process.stdout.write(JSON.stringify({ ok: true, buildId: state.buildId, commit: headToPublish, datedUrl: waitResult.datedUrl }, null, 2));
}

main();

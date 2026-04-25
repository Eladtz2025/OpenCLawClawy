const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML_PATH = path.join(ROOT, 'live-site', `${new Date().toISOString().slice(0, 10)}.html`);
const MAX_ATTEMPTS = 6;
const SLEEP_MS = 15000;

function fetchHead(url) {
  return execFileSync('curl.exe', ['-I', '-L', '--silent', '--show-error', '--fail', url], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function sleep(ms) {
  execFileSync('powershell', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`], { stdio: 'ignore' });
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const html = fs.readFileSync(HTML_PATH, 'utf8');
const refs = [...html.matchAll(/src="(\.\/assets\/media\/[^"]+)"/g)].map(m => m[1]);
if (refs.length === 0) {
  fail('No media references found in daily public HTML');
}

const uniqueRefs = [...new Set(refs)];
const base = 'https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site/';
const sampleUrls = uniqueRefs.slice(0, 12).map(rel => new URL(rel.replace(/^\.\//, ''), base).toString());

let lastMissing = [];
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const missing = [];
  for (const url of sampleUrls) {
    try {
      const head = fetchHead(url);
      if (!/200 OK/i.test(head)) missing.push(url);
    } catch {
      missing.push(url);
    }
  }
  if (missing.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, checked: sampleUrls.length, totalMediaRefs: uniqueRefs.length, attempts: attempt }, null, 2));
    process.exit(0);
  }
  lastMissing = missing;
  if (attempt < MAX_ATTEMPTS) sleep(SLEEP_MS);
}

fail(`Public media missing after retries: ${lastMissing[0]}`);

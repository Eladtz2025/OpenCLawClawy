const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML_PATH = path.join(ROOT, 'live-site', `${new Date().toISOString().slice(0, 10)}.html`);

function fetchHead(url) {
  return execFileSync('curl.exe', ['-I', '-L', '--silent', '--show-error', '--fail', url], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
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
const missing = [];
for (const rel of uniqueRefs.slice(0, 12)) {
  const url = new URL(rel.replace(/^\.\//, ''), base).toString();
  try {
    const head = fetchHead(url);
    if (!/200 OK/i.test(head)) missing.push(url);
  } catch {
    missing.push(url);
  }
}

if (missing.length > 0) {
  fail(`Public media missing: ${missing[0]}`);
}

process.stdout.write(JSON.stringify({ ok: true, checked: Math.min(uniqueRefs.length, 12), totalMediaRefs: uniqueRefs.length }, null, 2));

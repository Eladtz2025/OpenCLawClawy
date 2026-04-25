const fs = require('fs');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function readText(path) {
  return fs.readFileSync(path, 'utf8');
}

function hasCorruption(text = '') {
  const s = String(text || '');
  return ['�', '�?', 'A�', 'x?x', 'xTx', 'x~x'].some(marker => s.includes(marker));
}

const path = require('path');

const ROOT = __dirname;
const state = readJson(path.join(ROOT, 'state.json'));
const summary = readJson(path.join(ROOT, 'daily-summary.json'));
const items = readJson(path.join(ROOT, 'daily-final.json'));
const today = new Date().toISOString().slice(0, 10);
const html = readText(path.join(ROOT, 'live-site', `${today}.html`));
const latest = readText(path.join(ROOT, 'live-site', 'latest.html'));

if (!state.buildId) fail('Missing state.buildId');
if (!summary.buildId) fail('Missing summary.buildId');
if (state.buildId !== summary.buildId) fail(`Build ID mismatch: ${state.buildId} vs ${summary.buildId}`);
if (!html.includes(state.buildId)) fail('HTML missing buildId');
if (!html.includes(state.lastPublishedAt)) fail('HTML missing lastPublishedAt');
if (!latest.includes(state.buildId.slice('build-'.length))) fail('latest.html missing cache bust tied to current build');
if (!html.includes('assets/media/')) fail('HTML missing local media references');
if (hasCorruption(html)) fail('HTML contains likely corruption markers');
if (hasCorruption(JSON.stringify(items))) fail('daily-final contains likely corruption markers');

const tech2 = items.filter(x => x.category === 'technology2');
if (tech2.length === 0) fail('No technology2 items found');
if (!tech2.some(x => x.localMediaPath)) fail('technology2 missing local media');

console.log(JSON.stringify({
  ok: true,
  buildId: state.buildId,
  lastPublishedAt: state.lastPublishedAt,
  tech2WithMedia: tech2.filter(x => x.localMediaPath).length,
  itemCount: items.length
}, null, 2));

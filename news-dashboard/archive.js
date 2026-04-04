const fs = require('fs');
const path = require('path');

const siteDir = path.join(__dirname, 'site');
const archiveDir = path.join(siteDir, 'archive');
const latestPath = path.join(siteDir, 'latest.html');
const statePath = path.join(__dirname, 'state.json');

if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const archivePath = path.join(archiveDir, `${today}.html`);

if (fs.existsSync(latestPath)) {
  fs.copyFileSync(latestPath, archivePath);
}

const files = fs.readdirSync(archiveDir)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse();

for (const old of files.slice(7)) {
  fs.unlinkSync(path.join(archiveDir, old));
}

let state = { lastPublishedAt: null, archive: [] };
if (fs.existsSync(statePath)) {
  state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
}
state.lastPublishedAt = new Date().toISOString();
state.archive = fs.readdirSync(archiveDir)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
  .sort()
  .reverse();
fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
console.log(JSON.stringify({ archivePath, kept: state.archive.length }, null, 2));

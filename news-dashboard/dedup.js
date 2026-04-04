const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.join(__dirname, 'candidates.sample.json');
const outputPath = process.argv[3] || path.join(__dirname, 'deduped-candidates.json');

function normalizeTitle(s='') {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const seen = new Map();
for (const item of items) {
  const key = item.sourceUrl || normalizeTitle(item.title);
  if (!seen.has(key)) seen.set(key, item);
}
const out = Array.from(seen.values());
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
console.log(outputPath);

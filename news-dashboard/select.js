const fs = require('fs');
const path = require('path');

const scoredPath = process.argv[2] || path.join(__dirname, 'scored-candidates.json');
const statePath = process.argv[3] || path.join(__dirname, 'state.json');
const outputPath = process.argv[4] || path.join(__dirname, 'selected-candidates.json');

const maxPerCategory = { technology: 5, israel: 5, crypto: 5, hapoel: 5 };

const items = JSON.parse(fs.readFileSync(scoredPath, 'utf8'));
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { categories: {} };

const grouped = { technology: [], israel: [], crypto: [], hapoel: [] };
for (const item of items) {
  if (!grouped[item.category]) grouped[item.category] = [];
  grouped[item.category].push(item);
}

const selected = [];
for (const [category, arr] of Object.entries(grouped)) {
  const lastIds = state.categories?.[category]?.lastIds || [];
  const boosted = arr
    .map(item => ({ ...item, _repeatPenalty: lastIds.includes(item.id) ? -2 : 0 }))
    .sort((a,b) => ((b.score?.total || 0) + (b._repeatPenalty||0)) - ((a.score?.total || 0) + (a._repeatPenalty||0)))
    .slice(0, maxPerCategory[category] || 5)
    .map(({ _repeatPenalty, ...rest }) => rest);
  selected.push(...boosted);
}

fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2), 'utf8');
console.log(outputPath);

const fs = require('fs');
const path = require('path');

const selectedPath = process.argv[2] || path.join(__dirname, 'selected-candidates.json');
const statePath = process.argv[3] || path.join(__dirname, 'state.json');

const selected = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { categories: {}, publishedStories: [] };

state.lastPublishedAt = new Date().toISOString();
state.publishedStories = selected.map(x => ({ id: x.id, category: x.category, title: x.title, publishedAt: state.lastPublishedAt }));

for (const category of ['technology','israel','crypto','hapoel']) {
  const ids = selected.filter(x => x.category === category).map(x => x.id);
  if (!state.categories[category]) state.categories[category] = {};
  state.categories[category].lastIds = ids;
  state.categories[category].lastUpdatedAt = state.lastPublishedAt;
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
console.log(statePath);

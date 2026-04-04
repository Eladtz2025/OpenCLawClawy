const fs = require('fs');
const path = require('path');

const sources = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.config.json'), 'utf8'));
const out = {
  generatedAt: new Date().toISOString(),
  categories: {}
};

for (const [category, defs] of Object.entries(sources)) {
  out.categories[category] = {
    targetCandidates: 20,
    sourceCount: defs.length,
    sources: defs,
    candidates: []
  };
}

fs.writeFileSync(path.join(__dirname, 'collection-plan.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(path.join(__dirname, 'collection-plan.json'));

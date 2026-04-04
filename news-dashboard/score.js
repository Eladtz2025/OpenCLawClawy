const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.join(__dirname, 'candidates.sample.json');
const outputPath = process.argv[3] || path.join(__dirname, 'scored-candidates.json');

const sourceStrengthValue = { high: 9, medium: 6, low: 3 };

function computeScore(item) {
  const significance = item.score?.significance ?? 5;
  const reliability = item.score?.reliability ?? sourceStrengthValue[item.sourceStrength || 'medium'] ?? 6;
  const novelty = item.score?.novelty ?? 5;
  const immediacy = item.score?.immediacy ?? 5;
  const usefulness = item.score?.usefulness ?? 5;
  const total = significance + reliability + novelty + immediacy + usefulness;
  return { significance, reliability, novelty, immediacy, usefulness, total };
}

const items = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
for (const item of items) item.score = computeScore(item);
items.sort((a,b) => (b.score.total || 0) - (a.score.total || 0));
fs.writeFileSync(outputPath, JSON.stringify(items, null, 2), 'utf8');
console.log(outputPath);

const fs = require('fs');
const path = require('path');

const selectedPath = process.argv[2] || path.join(__dirname, 'selected-candidates.json');
const outputPath = process.argv[3] || path.join(__dirname, 'selected-candidates.with-fallback.json');

const items = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
const byCategory = { technology: [], israel: [], crypto: [], hapoel: [] };
for (const item of items) byCategory[item.category]?.push(item);

for (const key of ['crypto', 'hapoel']) {
  if ((byCategory[key] || []).length === 0) {
    byCategory[key].push({
      id: `${key}-weekly-fallback-placeholder`,
      category: key,
      title: 'אין מספיק חומר חזק מהיום — נדרש fallback שבועי',
      summary: 'כרגע זה placeholder עד שיחובר fallback חי של 7 ימים.',
      why: 'כדי שהמערכת לא תשאיר קטגוריה ריקה מהר מדי.',
      source: 'Hybrid engine',
      sourceUrl: 'https://eladtz2025.github.io/OpenCLawClawy/',
      certainty: 'חלקית מאומת',
      hype: 'נמוכה',
      worth: 'אולי',
      action: 'לעקוב',
      fallbackMode: 'weekly',
      score: { significance: 4, reliability: 7, novelty: 3, immediacy: 2, usefulness: 5, total: 21 }
    });
  }
}

const out = [...byCategory.technology, ...byCategory.israel, ...byCategory.crypto, ...byCategory.hapoel];
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
console.log(outputPath);

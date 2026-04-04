const fs = require('fs');
const path = require('path');

const queriesPath = path.join(__dirname, 'fetch-queries.json');
const outputPath = path.join(__dirname, 'ingest-plan.json');
const queries = JSON.parse(fs.readFileSync(queriesPath, 'utf8'));

const plan = {
  generatedAt: new Date().toISOString(),
  categories: Object.fromEntries(
    Object.entries(queries).map(([category, q]) => [category, {
      queries: q,
      intendedCandidates: 20,
      status: 'query-execution-pending'
    }])
  )
};

fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2), 'utf8');
console.log(outputPath);

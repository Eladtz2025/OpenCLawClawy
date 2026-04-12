const fs = require('fs');
const path = require('path');

function normalize(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function cleanTitle(title = '') {
  return normalize(String(title)
    .replace(/^מה חדש:\s*/i, '')
    .replace(/^כדאי לדעת:\s*/i, '')
    .replace(/^התפתחות מרכזית:\s*/i, '')
    .replace(/^תמונת מצב:\s*/i, '')
    .replace(/^עדכון מועדון:\s*/i, '')
    .replace(/^משחק\/לו"ז:\s*/i, ''));
}

function scoreEditorial(topicKey, item) {
  const title = cleanTitle(item.title || item.summary || '');
  const hay = `${title} ${item.source || ''} ${item.sourceUrl || ''}`.toLowerCase();
  let score = Number(item.score || 0);

  if (title.length < 28) score -= 20;
  if (/view more|blog\.?$|search|category|tag\/|price\/|theme week|newsletter|podcast|explainer/.test(hay)) score -= 30;
  if (/continue reading|share this story|read more/.test(hay)) score -= 40;

  if (topicKey === 'technology') {
    if (/microsoft|openai|anthropic|google|meta|claude|gemini|chip|model|agent|ai/i.test(hay)) score += 12;
    if (/house|molotov|virality|heart/.test(hay)) score -= 10;
  }

  if (topicKey === 'technology2') {
    if (/openai|gemini|claude|model|מודל|השיק|השיקה|כלי|tool|agent/i.test(hay)) score += 10;
    if (/קהילה|תגובה|דעה|קורס/.test(hay)) score -= 8;
  }

  if (topicKey === 'israel') {
    if (/איראן|עזה|לבנון|חיזבאללה|כנסת|ממשלה|ביטחון|צה"ל|מלחמה|חטופים|קבינט/.test(title)) score += 12;
  }

  if (topicKey === 'crypto') {
    if (/bitcoin|btc|ethereum|eth|xrp|token|market|sec|etf|exchange|defi/i.test(hay)) score += 12;
    if (/game|clone|skilled, lucky or rich|search-filings|public dissemination/.test(hay)) score -= 20;
  }

  if (topicKey === 'hapoel') {
    if (/הפועל פ"ת|הפועל פתח תקווה|פלייאוף|עומר פרץ|מחזור|משחק|מאמן/.test(title)) score += 10;
    if (/מכבי|בית"ר|הפועל חיפה|הפועל ירושלים/.test(title) && !/הפועל פ"ת|הפועל פתח תקווה/.test(title)) score -= 12;
  }

  return score;
}

function chooseTop(topicKey, candidates, wanted = 5) {
  const rescored = candidates.map(item => ({ ...item, editorialScore: scoreEditorial(topicKey, item) }));
  rescored.sort((a, b) => b.editorialScore - a.editorialScore || Number(b.score || 0) - Number(a.score || 0));

  const out = [];
  const seen = new Set();
  const sourceCaps = new Map();

  for (const item of rescored) {
    const key = cleanTitle(item.title || item.summary || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    const sourceCount = sourceCaps.get(item.source) || 0;
    if (sourceCount >= 2) continue;
    out.push({ ...item, summary: cleanTitle(item.summary || item.title || '') });
    seen.add(key);
    sourceCaps.set(item.source, sourceCount + 1);
    if (out.length >= wanted) break;
  }

  return out;
}

function main() {
  const topicKey = process.argv[2];
  const inputPath = process.argv[3];
  const outputPath = process.argv[4];
  if (!topicKey || !inputPath || !outputPath) {
    console.error('Usage: node news-editor-agent.js <topicKey> <inputPath> <outputPath>');
    process.exit(2);
  }

  const candidates = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const selected = chooseTop(topicKey, candidates, 5);
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(selected, null, 2), 'utf8');
  console.log(JSON.stringify({ topic: topicKey, selected: selected.length, outputPath }, null, 2));
}

main();

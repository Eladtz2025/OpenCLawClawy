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

function cleanBody(text = '') {
  const cleaned = normalize(String(text)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:facebook|whatsapp|telegram|instagram|youtube|rss)\b/gi, ' ')
    .replace(/\b(?:subscribe|newsletter|advertisement|related|comments?)\b/gi, ' ')
    .replace(/\b(?:loading video|search \/|close search|skip to main content)\b/gi, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' '));

  const stopMarkers = [
    'skip to main content',
    'comment loader',
    'save story',
    'coin prices',
    'price data by',
    'create an account to save your articles',
    'comments back to top',
    'you might also like',
    'photo-illustration:',
    'disclosure & polices',
    'newsletters'
  ];

  const lower = cleaned.toLowerCase();
  let cutIndex = cleaned.length;
  for (const marker of stopMarkers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0 && idx < cutIndex) cutIndex = idx;
  }
  return normalize(cleaned.slice(0, cutIndex));
}

function makeFallbackSummary(item, topicKey) {
  const title = cleanTitle(item.title || item.summary || '');
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
  const compactBody = body
    .replace(title, '')
    .replace(/^[-–—,:;\s]+/, '')
    .trim();

  if (topicKey === 'hapoel') {
    if (compactBody) return compactBody.slice(0, 220);
    return `עדכון קצר סביב ${title}.`;
  }

  if (topicKey === 'technology2' && compactBody) {
    return compactBody.slice(0, 180);
  }

  if (compactBody) return compactBody.slice(0, 220);
  return title;
}

function sanitizeSummary(text = '', item, topicKey) {
  const cleaned = normalize(String(text)
    .replace(/^summary\s*[:：-]?/i, '')
    .replace(/^סיכום\s*[:：-]?/i, '')
    .replace(/^highlight[s]?\s*[:：-]?/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' '));

  if (!cleaned) return makeFallbackSummary(item, topicKey);
  if (cleaned.length < 20) return makeFallbackSummary(item, topicKey);
  if (/^(none|n\/a|null|undefined)$/i.test(cleaned)) return makeFallbackSummary(item, topicKey);
  if (/skip to main content|coin prices|comment loader|save story/i.test(cleaned)) return makeFallbackSummary(item, topicKey);
  return cleaned.slice(0, 260);
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
    if (/podcast|scale up nation/.test(hay)) score -= 24;
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
    if (/game|clone|skilled, lucky or rich|search-filings|public dissemination|long reads|deep dives|biggest bitcoin portfolios/.test(hay)) score -= 20;
  }

  if (topicKey === 'hapoel') {
    if (/הפועל פ"ת|הפועל פתח תקווה|פלייאוף|עומר פרץ|מחזור|משחק|מאמן/.test(title)) score += 10;
    if (/מכירת מנוי|מנויים|כרטיסים/.test(title)) score -= 18;
    if (/מכבי|בית"ר|הפועל חיפה|הפועל ירושלים/.test(title) && !/הפועל פ"ת|הפועל פתח תקווה/.test(title)) score -= 12;
  }

  return score;
}

function chooseTop(topicKey, candidates, wanted = 5) {
  const filtered = candidates.filter(item => {
    const title = cleanTitle(item.title || item.summary || '');
    const hay = `${title} ${item.sourceUrl || ''} ${item.source || ''}`.toLowerCase();
    if (title.length < 24) return false;
    if (/^\d+(?:\s+to\s+\d+)?\s+percent\b/i.test(title)) return false;
    if (/policy & regulation|theme week|news explorer|tag\/|category\/|\/video\/|podcast|scale up nation|long reads|deep dives|livestream|live stream|join our livestream|largest publicly traded|publicly traded ethereum treasury firms|biggest crypto cases dumped|unicoin foundation|startale expands/i.test(hay)) return false;
    if (/loading video|search \//i.test((item.articlePreview || item.articleBody || '').toLowerCase())) return false;
    return true;
  });

  const rescored = filtered.map(item => ({ ...item, editorialScore: scoreEditorial(topicKey, item) }));
  rescored.sort((a, b) => b.editorialScore - a.editorialScore || Number(b.score || 0) - Number(a.score || 0));

  const out = [];
  const seen = new Set();
  const sourceCaps = new Map();

  for (const item of rescored) {
    const key = cleanTitle(item.title || item.summary || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    const sourceCount = sourceCaps.get(item.source) || 0;
    if (sourceCount >= 2) continue;
    out.push({
      ...item,
      summary: cleanTitle(item.summary || item.title || ''),
      editorNote: '' 
    });
    seen.add(key);
    sourceCaps.set(item.source, sourceCount + 1);
    if (out.length >= wanted) break;
  }

  return out;
}

async function generateSmartSummary(item, topicKey) {
  const title = item.title || '';
  const body = item.articleBody || item.articlePreview || '';
  
  const prompt = `
You are a professional news editor. Your goal is to create a "Highlights" summary for a news item.
Do NOT repeat the title. Do NOT use filler phrases like "The article discusses" or "According to the source".

Key Rules:
1. Focus on the real value/impact (what actually happened).
2. If the content is already clear, concise, and direct (e.g., a sports result, a clear announcement, or a fact-based update), do NOT over-edit it. Simply refine it to be clean and professional.
3. Do NOT try to "deepen" or "analyze" a simple fact into a story. Keep the essence.
4. Write in Hebrew. Keep it to 1-3 short sentences max.

Topic: ${topicKey}
Title: ${title}
Content: ${body}

Summary (Hebrew):`;

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4:31b-cloud',
        prompt: prompt,
        stream: false
      })
    });
    const data = await response.json();
    return sanitizeSummary(data.response || '', item, topicKey);
  } catch (e) {
    console.error(`LLM Error for ${title}: ${e.message}`);
    return makeFallbackSummary(item, topicKey);
  }
}

async function main() {
  const topicKey = process.argv[2];
  const inputPath = process.argv[3];
  const outputPath = process.argv[4];
  if (!topicKey || !inputPath || !outputPath) {
    console.error('Usage: node news-editor-agent.js <topicKey> <inputPath> <outputPath>');
    process.exit(2);
  }

  const candidates = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const selected = chooseTop(topicKey, candidates, 5);

  // Now we apply the Smart Edit to the selected items
  for (const item of selected) {
    const summary = await generateSmartSummary(item, topicKey);
    item.editorNote = sanitizeSummary(summary, item, topicKey);
  }

  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(selected, null, 2), 'utf8');
  console.log(JSON.stringify({ topic: topicKey, selected: selected.length, outputPath }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

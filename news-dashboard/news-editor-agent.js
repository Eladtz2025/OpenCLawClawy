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

function looksCorruptedHebrew(text = '') {
  const value = String(text || '');
  if (!value) return false;
  const badMarkers = ['x?x', 'xTx', 'x~x', 'x�', '�?', 'A�'];
  return badMarkers.some(marker => value.includes(marker));
}

function cleanBody(text = '') {
  const cleaned = normalize(String(text)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:facebook|whatsapp|telegram|instagram|youtube|rss)\b/gi, ' ')
    .replace(/\b(?:subscribe|newsletter|advertisement|related|comments?)\b/gi, ' ')
    .replace(/\b(?:loading video|search \/|close search|skip to main content)\b/gi, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(/every weekday and sunday, you can get the best of techcrunch[\s\S]*$/i, ' ')
    .replace(/when you purchase through links in our articles, we may earn a small commission[\s\S]*$/i, ' ')
    .replace(/all news defi explore all news[\s\S]*/i, ' ')
    .replace(/dl news defi regulation markets deals ethereum bitcoin about us contact us work with us[\s\S]*?share copy link/i, ' ')
    .replace(/0\.03 % [\s\S]*?share copy link/i, ' ')
    .replace(/^עדכון\s*\d{1,2}\/\d{1,2}:?/u, ' ')
    .replace(/^שעות המשחקים עודכנו עד המחזור ה\d+\.?/u, ' ')
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

function sentenceTrim(text = '', max = 220, min = 0) {
  const clean = normalize(text);
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max + 1);
  const punctuationCut = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '), sliced.lastIndexOf('। '));
  if (punctuationCut > Math.max(Math.floor(max * 0.45), min)) return sliced.slice(0, punctuationCut + 1).trim();
  const spaceCut = sliced.lastIndexOf(' ');
  if (spaceCut > Math.max(Math.floor(max * 0.6), min)) return sliced.slice(0, spaceCut).trim();
  return sliced.slice(0, max).trim();
}

function dynamicSummaryLimit(item = {}, topicKey = '') {
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
  const title = cleanTitle(item.title || item.summary || '');
  const source = String(item.source || '').toLowerCase();
  let max = 260;
  let min = 90;

  if (topicKey === 'hapoel') {
    max = 190;
    min = 70;
  } else if (topicKey === 'technology2') {
    max = 240;
    min = 80;
  } else if (topicKey === 'crypto') {
    max = 230;
    min = 85;
  }

  if (body.length > 700) max += 70;
  else if (body.length > 420) max += 35;
  else if (body.length < 160) max -= 40;

  if (/telegram|t\.me\//i.test(source)) max -= 20;
  if (/ניתוח|הסבר|מאחורי הקלעים|strategy|roadmap|regulation|earnings|lawsuit|funding|security/i.test(`${title} ${body}`)) max += 30;

  max = Math.max(max, min + 40);
  return { max, min };
}

function makeFallbackSummary(item, topicKey) {
  const title = cleanTitle(item.title || item.summary || '');
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
  const safeTitle = looksCorruptedHebrew(title) ? cleanTitle(item.normalizedTitle || item.summary || '') : title;
  const safeBody = looksCorruptedHebrew(body) ? '' : body;
  const compactBody = safeBody
    .replace(safeTitle, '')
    .replace(/^[-–—,:;\s]+/, '')
    .trim();

  if (topicKey === 'hapoel') {
    const shortBody = compactBody
      .replace(/^נקבע סדר ושעות המשחקים לפלייאוף העליון\s*\d+\s*באפר׳?/u, '')
      .replace(/^בהחלטת המנהלת מחזורי 34 ו35 הוחלפו\. המשחקים בעמוד זה מעודכנים בהתאם\.?/u, '')
      .replace(/^עם סיום העונה הסדירה בליגת ווינר,\s*\.?/u, '')
      .replace(/מחזור\s*27:[\s\S]*$/u, 'נקבע לוח המשחקים לפלייאוף העליון, כולל מועדי המשחקים שכבר פורסמו.')
      .replace(/\s+/g, ' ')
      .trim();
    if (shortBody) {
      const limits = dynamicSummaryLimit(item, topicKey);
      return sentenceTrim(shortBody, limits.max, limits.min);
    }
    return `עדכון קצר סביב ${safeTitle || title}.`;
  }

  if (compactBody) {
    const limits = dynamicSummaryLimit(item, topicKey);
    return sentenceTrim(compactBody, limits.max, limits.min);
  }
  return safeTitle || title;
}

function sanitizeSummary(text = '', item, topicKey) {
  const cleaned = normalize(String(text)
    .replace(/^summary\s*[:：-]?/i, '')
    .replace(/^סיכום\s*[:：-]?/i, '')
    .replace(/^highlight[s]?\s*[:：-]?/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' '));

  if (looksCorruptedHebrew(cleaned)) return makeFallbackSummary(item, topicKey);
  if (!cleaned) return makeFallbackSummary(item, topicKey);
  if (cleaned.length < 20) return makeFallbackSummary(item, topicKey);
  if (/^(none|n\/a|null|undefined)$/i.test(cleaned)) return makeFallbackSummary(item, topicKey);
  if (/skip to main content|coin prices|comment loader|save story/i.test(cleaned)) return makeFallbackSummary(item, topicKey);
  const limits = dynamicSummaryLimit(item, topicKey);
  return sentenceTrim(cleaned, limits.max, limits.min);
}

function detectSummaryOverclaim(summary = '', item = {}) {
  const text = normalize(`${summary} ${item.title || ''} ${item.articleBody || ''} ${item.articleDescription || ''}`);
  const lower = text.toLowerCase();
  const flags = [];

  if (/claude code/i.test(lower) && /חינם|חינמי|בחינם|free/i.test(lower) && /openrouter|lm studio|deepseek|llama|nvidia nim/i.test(lower)) flags.push('claude_free_overclaim');
  if (/רשמי|official|native/i.test(lower) && /fork|wrapper|openrouter|lm studio|deepseek|llama|nvidia nim/i.test(lower)) flags.push('officiality_overclaim');
  if (/בוודאות|בטוח|מובטח|אין ספק|definitely|guaranteed/i.test(lower)) flags.push('certainty_overclaim');
  if (/חינם|free|ללא תשלום/i.test(lower) && !/לטענת|לכאורה|לא רשמי|wrapper|fork/i.test(lower) && /telegram|t\.me\//i.test(`${item.sourceUrl || ''} ${item.source || ''}`.toLowerCase())) flags.push('unqualified_free_claim');

  return flags;
}

function rewriteOverclaimSummary(summary = '', item = {}, topicKey, flags = []) {
  if (flags.includes('claude_free_overclaim')) {
    return 'לא מדובר ב-Claude הרשמי בחינם, אלא לכל היותר במעטפת לא רשמית שמתחברת לספקי מודלים אחרים.';
  }
  if (flags.includes('officiality_overclaim')) {
    return 'הניסוח כאן חזק מדי. אם מדובר ב-wrapper או fork שמתחבר לספקים אחרים, לא נכון להציג את זה כמוצר רשמי.';
  }
  if (flags.includes('unqualified_free_claim')) {
    return 'יש כאן טענת "חינם", אבל בלי אימות ברור מול מקור רשמי עדיף להציג אותה בזהירות ולא כעובדה.';
  }
  if (flags.includes('certainty_overclaim')) {
    const limits = dynamicSummaryLimit(item, topicKey);
    return sentenceTrim(`הניסוח המקורי בטוח מדי. הניסוח הזהיר יותר הוא: ${summary}`, limits.max, limits.min);
  }
  return sanitizeSummary(summary, item, topicKey);
}

function buildGroundingCorpus(item = {}) {
  const parts = [
    item.title || '',
    item.articleDescription || '',
    item.articlePreview || '',
    item.articleBody || ''
  ]
    .map(cleanBody)
    .filter(Boolean);
  return normalize(parts.join(' '));
}

function hasGroundingOverlap(summarySentence = '', corpus = '') {
  const summaryTokens = normalize(summarySentence)
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.replace(/[.,;:!?()"'`“”׳״-]/g, ''))
    .filter(token => token.length >= 4);

  if (summaryTokens.length === 0) return true;
  const uniqueTokens = [...new Set(summaryTokens)];
  const matches = uniqueTokens.filter(token => corpus.includes(token));
  return matches.length >= Math.max(2, Math.ceil(uniqueTokens.length * 0.35));
}

function groundSummary(summary = '', item = {}, topicKey) {
  const cleaned = sanitizeSummary(summary, item, topicKey);
  const corpus = buildGroundingCorpus(item).toLowerCase();
  if (!corpus) return makeFallbackSummary(item, topicKey);

  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => normalize(s))
    .filter(Boolean);

  const grounded = sentences.filter(sentence => hasGroundingOverlap(sentence, corpus));
  if (grounded.length === 0) return makeFallbackSummary(item, topicKey);

  const rebuilt = sanitizeSummary(grounded.join(' '), item, topicKey);
  if (rebuilt.length < 24) return makeFallbackSummary(item, topicKey);
  return rebuilt;
}

function detectHypeFlags(topicKey, item) {
  const title = cleanTitle(item.title || item.summary || '');
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
  const hay = `${title} ${item.source || ''} ${item.sourceUrl || ''} ${body}`.toLowerCase();
  const flags = [];

  if (/חינם|חינמי|בחינם|ללא תשלום|בלי לשלם|free|free forever|zero cost|0 ש"ח|0₪|unlimited/i.test(hay)) flags.push('free_claim');
  if (/מהפכה|מטורף|טירוף|משוגע|game changer|crazy|insane|unbelievable|לא נורמלי|וואו|שובר את האינטרנט/i.test(hay)) flags.push('hype_language');
  if (/כלי רשמי|רשמית|official|native|מוצר רשמי/i.test(hay) && /fork|wrapper|openrouter|lm studio|deepseek|llama|nvidia nim/i.test(hay)) flags.push('officiality_conflict');
  if (/claude code/i.test(hay) && /free_claim/.test(flags.join(' ')) && /openrouter|lm studio|deepseek|llama|nvidia nim/i.test(hay)) flags.push('claude_wrapper_claim');
  if (/ללא הגבלות|בלי הגבלות|unlimited|ללא מגבלות/i.test(hay)) flags.push('unbounded_claim');
  if (/guaranteed|מובטח|בטוח לגמרי|ודאי/i.test(hay)) flags.push('certainty_overclaim');

  if (topicKey === 'technology2' && /telegram|t\.me\//i.test(hay) && flags.length > 0) flags.push('telegram_hype_sensitive');

  return [...new Set(flags)];
}

function buildCautiousSummary(item, topicKey, flags = []) {
  const title = cleanTitle(item.title || item.summary || '');
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');

  if (flags.includes('claude_wrapper_claim')) {
    return 'לטענת הפוסט, מדובר במעטפת לא רשמית ל-Claude Code שמתחברת למודלים אחרים, לא בגישה חינמית רשמית ל-Claude של Anthropic.';
  }
  if (flags.includes('officiality_conflict')) {
    return 'יש כאן ערבוב בין מיתוג רשמי לבין תיאור של wrapper או חיבור לספקים אחרים, ולכן צריך להתייחס לטענה בזהירות.';
  }
  if (flags.includes('free_claim')) {
    return 'הפוסט מציג טענת "חינם", אבל בלי אימות ברור מול המוצר הרשמי, ולכן צריך לראות בזה טענה שדורשת בדיקה.';
  }
  if (flags.includes('hype_language')) {
    const limits = dynamicSummaryLimit(item, topicKey);
    return sentenceTrim(`הפוסט מנוסח בצורה שיווקית ומנופחת. העובדות שכדאי לקחת ממנו הן: ${body || title}`, limits.max, limits.min);
  }
  return makeFallbackSummary(item, topicKey);
}

function detectSourceQualityIssues(topicKey, item) {
  const title = cleanTitle(item.title || item.summary || '');
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
  const hay = `${title} ${item.source || ''} ${item.sourceUrl || ''} ${body}`.toLowerCase();
  const issues = [];

  if (title.length < 28) issues.push('short_title');
  if (body.length < 80) issues.push('thin_body');
  if (/לחצו|להצטרפות|הצטרפו|join|telegram|whatsapp|facebook|youtube|לקריאה נוחה|לינק|קישור לשידור/i.test(hay) && body.length < 180) issues.push('cta_heavy');
  if (/שיחקו אותה|מטורף|וואו|יססס|לא נורמלי|משוגע|crazy|insane/i.test(hay) && body.length < 160) issues.push('hype_only');
  if (!/[0-9]/.test(body) && !/חברה|מודל|השיקה|פרסמה|הודיעה|released|launched|announced|reported|according|מבחן|גרסה|api/i.test(hay) && topicKey !== 'hapoel') issues.push('low_fact_density');
  if (topicKey === 'technology2' && /telegram|t\.me\//i.test(hay) && body.length < 140) issues.push('weak_telegram_post');
  if (topicKey === 'technology2' && /לקריאה נוחה|במחשב|בנייד|הצטרפו|קבוצה|קהילה/i.test(hay)) issues.push('promo_post');

  return [...new Set(issues)];
}

function scoreEditorial(topicKey, item) {
  const title = cleanTitle(item.title || item.summary || '');
  const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
  const hay = `${title} ${item.source || ''} ${item.sourceUrl || ''} ${body}`.toLowerCase();
  let score = Number(item.score || 0);
  const hypeFlags = detectHypeFlags(topicKey, item);
  const qualityIssues = detectSourceQualityIssues(topicKey, item);

  if (title.length < 28) score -= 20;
  if (/view more|blog\.?$|search|category|tag\/|price\/|theme week|newsletter|podcast|explainer/.test(hay)) score -= 30;
  if (/continue reading|share this story|read more/.test(hay)) score -= 40;

  if (topicKey === 'technology') {
    if (/microsoft|openai|anthropic|google|meta|claude|gemini|chip|model|agent|ai|cybersecurity|robot|workspace|chrome/i.test(hay)) score += 12;
    if (/startup|funding|launch|product|tool|enterprise|browser|cloud|tpu|workspace|gmail|meet/i.test(hay)) score += 4;
    if (/techcrunch ai|ars technica|the verge tech/i.test(hay)) score += 3;
    if (/house|molotov|virality|heart/.test(hay)) score -= 10;
    if (/podcast|scale up nation/.test(hay)) score -= 24;
    if (/human sperm|embryos|cocaine to salmon|rfk jr|vision pro rollout|antichrist/i.test(hay)) score -= 12;
    if (/best fitbit|best smartwatch|best fitness tracker|review|reviews|buyers guide|buying guide|hands on/i.test(hay)) score -= 18;
    if (/wired/i.test(hay) && !/openai|anthropic|google|meta|microsoft|ai|cybersecurity|agent|model/.test(hay)) score -= 6;
  }

  if (topicKey === 'crypto') {
    if (/bitcoin|btc|ethereum|eth|xrp|token|market|sec|etf|exchange|defi|stablecoin|wallet/i.test(hay)) score += 12;
    if (/game|clone|skilled, lucky or rich|search-filings|public dissemination|long reads|deep dives|biggest bitcoin portfolios/.test(hay)) score -= 20;
    if (/markets|policy|regulation|hack|exploit|treasury|bond|options|node/.test(hay)) score += 4;
  }

  if (topicKey === 'hapoel') {
    if (/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה|פלייאוף|עומר פרץ|מחזור|משחק|מאמן/.test(title)) score += 10;
    if (/מכירת מנוי|מנויים|כרטיסים/.test(title)) score -= 18;
    if (/מכבי|בית"ר|הפועל חיפה|הפועל ירושלים/.test(title) && !/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה/.test(title)) score -= 12;
  }

  if (/menu account|security politics|the big story|all news defi explore all news|web3 snapshot|people & culture|follow us \/ a part of|top of page/.test(hay)) score -= 18;

  if (topicKey === 'technology2') {
    if (/openai|gemini|claude|model|מודל|השיק|השיקה|כלי|tool|agent/i.test(hay)) score += 10;
    if (/קהילה|תגובה|דעה|קורס/.test(hay)) score -= 8;
    if (hypeFlags.length) score -= 10;
  }

  if (qualityIssues.includes('thin_body')) score -= 10;
  if (qualityIssues.includes('cta_heavy')) score -= 12;
  if (qualityIssues.includes('hype_only')) score -= 14;
  if (qualityIssues.includes('low_fact_density')) score -= 10;
  if (qualityIssues.includes('weak_telegram_post')) score -= 16;
  if (qualityIssues.includes('promo_post')) score -= 18;

  if (hypeFlags.includes('free_claim')) score -= 14;
  if (hypeFlags.includes('hype_language')) score -= 10;
  if (hypeFlags.includes('officiality_conflict')) score -= 18;
  if (hypeFlags.includes('claude_wrapper_claim')) score -= 28;
  if (hypeFlags.includes('unbounded_claim')) score -= 12;
  if (hypeFlags.includes('certainty_overclaim')) score -= 8;
  if (hypeFlags.includes('telegram_hype_sensitive')) score -= 8;

  if (topicKey === 'israel') {
    if (/איראן|עזה|לבנון|חיזבאללה|כנסת|ממשלה|ביטחון|צה"ל|מלחמה|חטופים|קבינט/.test(title)) score += 12;
  }

  return score;
}

function chooseTop(topicKey, candidates, wanted = 5) {
  const targetCount = topicKey === 'technology2' ? Math.max(wanted, candidates.length) : wanted;
  const filtered = candidates.filter(item => {
    const title = cleanTitle(item.title || item.summary || '');
    const body = cleanBody(item.articleDescription || item.articlePreview || item.articleBody || '');
    const hay = `${title} ${item.sourceUrl || ''} ${item.source || ''} ${body}`.toLowerCase();
    const hypeFlags = detectHypeFlags(topicKey, item);
    const qualityIssues = detectSourceQualityIssues(topicKey, item);
    if (title.length < 24) return false;
    if (/^\d+(?:\s+to\s+\d+)?\s+percent\b/i.test(title)) return false;
    if (/policy & regulation|theme week|news explorer|tag\/|category\/|\/video\/|podcast|scale up nation|long reads|deep dives|livestream|live stream|join our livestream|largest publicly traded|publicly traded ethereum treasury firms|biggest crypto cases dumped|unicoin foundation|startale expands/i.test(hay)) return false;
    if (topicKey === 'technology' && /best fitbit|best smartwatch|best fitness tracker|buyers guide|buying guide|\breview\b|\breviews\b|hands on/i.test(hay)) return false;
    if (/loading video|search \//i.test(hay)) return false;
    if (/menu account|security politics|the big story|all news defi explore all news|web3 snapshot|follow us \/ a part of|top of page/.test(hay)) return false;
    if (hypeFlags.includes('claude_wrapper_claim')) return false;
    if (topicKey === 'technology2' && hypeFlags.includes('officiality_conflict')) return false;
    if (qualityIssues.includes('promo_post')) return false;
    if (qualityIssues.includes('hype_only') && topicKey === 'technology2') return false;
    if (topicKey === 'technology2' && qualityIssues.includes('weak_telegram_post') && candidates.length > 5) return false;
    return true;
  });

  let workingSet = filtered;
  if (workingSet.length < targetCount) {
    workingSet = candidates.filter(item => {
      const qualityIssues = detectSourceQualityIssues(topicKey, item);
      if (qualityIssues.includes('promo_post')) return false;
      return true;
    });
  }

  const rescored = workingSet.map(item => ({ ...item, editorialScore: scoreEditorial(topicKey, item) }));
  rescored.sort((a, b) => b.editorialScore - a.editorialScore || Number(b.score || 0) - Number(a.score || 0));

  const out = [];
  const seen = new Set();
  const sourceCaps = new Map();

  for (const item of rescored) {
    const key = cleanTitle(item.title || item.summary || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    const sourceCount = sourceCaps.get(item.source) || 0;
    const sourceCap = topicKey === 'technology' || topicKey === 'crypto' ? 3 : 2;
    if (sourceCount >= sourceCap) continue;
    const hypeFlags = detectHypeFlags(topicKey, item);
    const qualityIssues = detectSourceQualityIssues(topicKey, item);
    out.push({
      ...item,
      hypeFlags,
      qualityIssues,
      summary: cleanTitle(item.summary || item.title || ''),
      editorNote: hypeFlags.length ? buildCautiousSummary(item, topicKey, hypeFlags) : '' 
    });
    seen.add(key);
    sourceCaps.set(item.source, sourceCount + 1);
    if (out.length >= targetCount) break;
  }

  if (out.length < targetCount) {
    for (const item of rescored) {
      const key = cleanTitle(item.title || item.summary || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      const hypeFlags = detectHypeFlags(topicKey, item);
      const qualityIssues = detectSourceQualityIssues(topicKey, item);
      out.push({
        ...item,
        hypeFlags,
        qualityIssues,
        summary: cleanTitle(item.summary || item.title || ''),
        editorNote: hypeFlags.length ? buildCautiousSummary(item, topicKey, hypeFlags) : ''
      });
      seen.add(key);
      if (out.length >= targetCount) break;
    }
  }

  return out;
}

async function generateSmartSummary(item, topicKey) {
  const title = item.title || '';
  const body = item.articleBody || item.articlePreview || '';
  
  const limits = dynamicSummaryLimit(item, topicKey);
  const prompt = `
You are a sharp Hebrew news editor writing a natural article summary for a dashboard.
Write only the summary itself, with no labels, no bullets, and no opening formulas.
Do NOT repeat the title unless it is necessary for clarity.

Rules:
1. Write a clean, direct summary in Hebrew.
2. The summary should be dynamic in length: if the story is simple, keep it short; if it has real depth or consequences, make it longer.
3. Usually aim for 1-3 sentences. Prefer enough detail so the reader will usually understand the item without opening it.
4. Include the core development, the important context, and the practical implication when relevant, but flow naturally as one summary.
5. Do not sound like a template. Vary rhythm and length.
6. Do not add headings like "מה קרה" or "למה זה חשוב".
7. Do not exaggerate, do not add certainty not supported by the text, and do not call something official or free unless clearly grounded.
8. If the source text is already clear and direct, lightly refine it instead of inventing extra depth.
9. Keep the summary roughly under ${limits.max} characters, unless a slightly shorter version is clearly better.

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
    const sanitized = sanitizeSummary(data.response || '', item, topicKey);
    const grounded = groundSummary(sanitized, item, topicKey);
    const overclaimFlags = detectSummaryOverclaim(grounded, item);
    if (overclaimFlags.length > 0) {
      return groundSummary(rewriteOverclaimSummary(grounded, item, topicKey, overclaimFlags), item, topicKey);
    }
    return grounded;
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
    if (Array.isArray(item.hypeFlags) && item.hypeFlags.length > 0) {
      item.editorNote = sanitizeSummary(buildCautiousSummary(item, topicKey, item.hypeFlags), item, topicKey);
      continue;
    }
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

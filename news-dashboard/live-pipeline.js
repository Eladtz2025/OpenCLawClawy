const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUT_DIR = __dirname;
const SITE_DIR = path.join(OUT_DIR, 'site');
const LIVE_DIR = path.join(OUT_DIR, 'live-site');
const ARCHIVE_DIR = path.join(LIVE_DIR, 'archive');
const STATE_PATH = path.join(OUT_DIR, 'state.json');
const FINAL_PATH = path.join(OUT_DIR, 'daily-final.json');
const SUMMARY_PATH = path.join(OUT_DIR, 'daily-summary.json');
const TELEGRAM_SUMMARY_PATH = path.join(OUT_DIR, 'telegram-summary.txt');
const TELEGRAM_ALERT_PATH = path.join(OUT_DIR, 'telegram-alert.txt');
const ROOT_INDEX_PATH = path.join(OUT_DIR, '..', 'index.html');
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();
const DRY_RUN = process.argv.includes('--dry-run');

const TOPICS = [
  {
    key: 'technology',
    label: 'Technology',
    hebrew: 'טכנולוגיה',
    description: 'Global tech and AI updates',
    sources: [
      { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/', kind: 'primary', parser: 'tc' },
      { name: 'The Verge Tech', url: 'https://www.theverge.com/tech', kind: 'primary', parser: 'verge' },
      { name: 'Google Blog Technology', url: 'https://blog.google/technology/', kind: 'secondary', parser: 'google' }
    ]
  },
  {
    key: 'technology2',
    label: 'Technology #2',
    hebrew: 'טכנולוגיה #2',
    description: 'Telegram-defined second technology feed',
    sources: [
      { name: 'TechNewsHeb Telegram', url: 'https://t.me/s/TechNewsHeb', kind: 'primary', parser: 'telegram' },
      { name: 'AI_tg_il Telegram', url: 'https://t.me/s/AI_tg_il', kind: 'primary', parser: 'telegram' },
      { name: 'botai14 Telegram', url: 'https://t.me/s/botai14', kind: 'secondary', parser: 'telegram' },
      { name: 'hackit770 Telegram', url: 'https://t.me/s/hackit770', kind: 'secondary', parser: 'telegram' }
    ]
  },
  {
    key: 'israel',
    label: 'Israel',
    hebrew: 'ישראל',
    description: 'Israeli current events',
    sources: [
      { name: 'ynet News', url: 'https://www.ynet.co.il/news', kind: 'primary', parser: 'ynet' },
      { name: 'Times of Israel', url: 'https://www.timesofisrael.com/', kind: 'secondary', parser: 'toi' },
      { name: 'Israel Gov RSS', url: 'https://www.gov.il/he/Departments/news?format=rss', kind: 'secondary', parser: 'rssgov' },
      { name: 'Gov.il News', url: 'https://www.gov.il/en/pages/news', kind: 'secondary', parser: 'gov' }
    ]
  },
  {
    key: 'crypto',
    label: 'Crypto',
    hebrew: 'קריפטו',
    description: 'Crypto markets and regulation',
    sources: [
      { name: 'CoinDesk', url: 'https://www.coindesk.com/', kind: 'primary', parser: 'coindesk' },
      { name: 'Decrypt', url: 'https://decrypt.co/', kind: 'secondary', parser: 'decrypt' },
      { name: 'SEC Press Releases', url: 'https://www.sec.gov/news/pressreleases', kind: 'secondary', parser: 'sec' }
    ]
  },
  {
    key: 'hapoel',
    label: 'Hapoel',
    hebrew: 'הפועל פתח תקווה',
    description: 'Hapoel Petah Tikva club updates',
    sources: [
      { name: 'Hapoel PT Official', url: 'https://www.hapoelpt.com/', kind: 'primary', parser: 'hapoel' },
      { name: 'ONE Hapoel PT', url: 'https://www.one.co.il/', kind: 'secondary', parser: 'one' },
      { name: 'Sport5', url: 'https://www.sport5.co.il/', kind: 'secondary', parser: 'sport5' }
    ]
  }
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&rlm;/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanText(s = '') {
  return decodeEntities(stripTags(s))
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMatches(html, regex, mapper, limit = 20) {
  const results = [];
  let match;
  while ((match = regex.exec(html)) && results.length < limit) {
    const mapped = mapper(match);
    if (mapped) results.push(mapped);
  }
  return results;
}

function absolutize(baseUrl, maybeUrl) {
  if (!maybeUrl) return baseUrl;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9,he;q=0.8'
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return text;
}

const parsers = {
  tc(html, source) {
    return extractMatches(
      html,
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (m) => {
        const href = absolutize(source.url, decodeEntities(m[1]));
        const text = cleanText(m[2]);
        if (!/techcrunch\.com\//i.test(href)) return null;
        if (text.length < 35 || text.length > 180) return null;
        return { title: text, url: href };
      },
      40
    );
  },
  verge(html, source) {
    return extractMatches(
      html,
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (m) => {
        const href = absolutize(source.url, decodeEntities(m[1]));
        const text = cleanText(m[2]);
        if (!/theverge\.com\//i.test(href)) return null;
        if (text.length < 35 || text.length > 180) return null;
        return { title: text, url: href };
      },
      40
    );
  },
  google(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/blog\.google\//i.test(href)) return null;
      if (text.length < 30 || text.length > 180) return null;
      return { title: text, url: href };
    }, 40);
  },
  telegram(html, source) {
    const textMatches = [...html.matchAll(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi)].slice(0, 30);
    const hrefMatches = [...html.matchAll(/<a[^>]+class="tgme_widget_message_date"[^>]+href="([^"]+)"/gi)].slice(0, 30);
    const out = [];
    for (let i = 0; i < Math.min(textMatches.length, hrefMatches.length); i += 1) {
      const text = cleanText(textMatches[i][1] || '');
      if (text.length < 25) continue;
      out.push({ title: text.slice(0, 160), url: absolutize(source.url, decodeEntities(hrefMatches[i][1])) });
    }
    return out;
  },
  ynet(html, source) {
    return extractMatches(html, /<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/ynet\.co\.il/i.test(href)) return null;
      if (text.length < 22 || text.length > 160) return null;
      return { title: text, url: href };
    }, 50);
  },
  toi(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/timesofisrael\.com\//i.test(href)) return null;
      if (/the-daily-edition|podcast|newsletter/i.test(href + ' ' + text)) return null;
      if (text.length < 25 || text.length > 180) return null;
      return { title: text, url: href };
    }, 80);
  },
  rssgov(html, source) {
    return extractMatches(html, /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/gi, (m) => {
      const text = cleanText(m[1]);
      const href = cleanText(m[2]);
      if (text.length < 18 || text.length > 180) return null;
      return { title: text, url: href };
    }, 40);
  },
  gov(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/gov\.il/i.test(href)) return null;
      if (text.length < 18 || text.length > 180) return null;
      return { title: text, url: href };
    }, 40);
  },
  coindesk(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/coindesk\.com\//i.test(href)) return null;
      if (text.length < 30 || text.length > 180) return null;
      return { title: text, url: href };
    }, 50);
  },
  decrypt(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/decrypt\.co\//i.test(href)) return null;
      if (text.length < 30 || text.length > 180) return null;
      return { title: text, url: href };
    }, 50);
  },
  sec(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/sec\.gov\//i.test(href)) return null;
      if (text.length < 25 || text.length > 200) return null;
      return { title: text, url: href };
    }, 40);
  },
  hapoel(html, source) {
    return extractMatches(html, /href="(https:\/\/www\.hapoelpt\.com\/post\/[^"]+)"/gi, (m) => {
      const href = decodeEntities(m[1]);
      const slug = href.split('/post/')[1] || '';
      const title = cleanText(slug.replace(/[-_]/g, ' '));
      if (title.length < 8 || title.length > 180) return null;
      return { title, url: href };
    }, 30);
  },
  one(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/one\.co\.il\//i.test(href)) return null;
      if (!/הפועל|פתח תקוה|פתח תקווה/i.test(text + ' ' + href)) return null;
      if (text.length < 12 || text.length > 180) return null;
      return { title: text, url: href };
    }, 50);
  },
  sport5(html, source) {
    return extractMatches(html, /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m) => {
      const href = absolutize(source.url, decodeEntities(m[1]));
      const text = cleanText(m[2]);
      if (!/sport5\.co\.il\//i.test(href)) return null;
      if (!/הפועל|פתח תקוה|פתח תקווה/i.test(text + ' ' + href)) return null;
      if (text.length < 12 || text.length > 180) return null;
      return { title: text, url: href };
    }, 50);
  }
};

function classifyCertainty(sourceKind, verifiedCount) {
  if (verifiedCount >= 2) return 'כן';
  if (verifiedCount === 1 && sourceKind === 'primary') return 'חלקית מאומת';
  return 'נמוכה';
}

function detectCategorySignals(topicKey, text, url) {
  const hay = `${text} ${url}`.toLowerCase();
  const negative = {
    technology: /podcast|newsletter|events|job|careers|privacy|terms|contact/,
    technology2: /תגובה|דעה|קורס|הרצאה|לינקדאין|קהילה/,
    israel: /podcast|daily edition|newsletter|opinion|magazine|culture|travel|מדיניות פרטיות|תנאי שימוש|צור קשר/,
    crypto: /podcast|newsletter|opinion|price prediction|sponsored/,
    hapoel: /shop|terms|privacy|community|school|academy|ticket office|חולצת|מחיר|₪|מוצר|store|הפועל ת"א|הפועל חיפה|הפועל י-ם|הפועל ירושלים|הפועל באר שבע|בית"ר|מכבי|יורוליג|לתקציר המשחק/
  };
  const positive = {
    technology: /ai|model|startup|chip|agent|openai|google|anthropic|microsoft|amazon|meta|launch|release/,
    technology2: /ai|מודל|השיקה|השיק|openai|gemini|claude|anthropic|google|agent|tool|מוצר/,
    israel: /ישראל|איראן|עזה|ביטחון|צה"ל|כנסת|ממשלה|משפט|חטו|ירי|מבצע|נאט"ו|לבנון|חיזבאללה|פיקוד העורף|קבינט|טראמפ|הורמוז/,
    crypto: /bitcoin|btc|eth|sol|xrp|etf|crypto|token|sec|exchange|wallet|blockchain/,
    hapoel: /הפועל|פתח תקווה|פתח תקוה|משחק|ליגה|מאמן|שחקן|סגל|ניצחון|הפסד|הרכב|אימון|תקציר|מחזור|שער|קבוצה|הודעת מועדון|training|פערים במו"מ|פלייאוף/
  };
  return {
    hasPositive: positive[topicKey]?.test(hay) ?? false,
    hasNegative: negative[topicKey]?.test(hay) ?? false
  };
}

function computeScore(item) {
  const title = item.title.toLowerCase();
  let significance = 5;
  if (item.signalPositive) significance += 2;
  if (/ai|openai|google|anthropic|chip|model|security|attack|war|government|bitcoin|etf|regulat|match|coach|league|election|court|שחקן|הרכב|ממשלה|ביטחון/i.test(title)) significance += 2;
  const reliability = item.sourceKind === 'primary' ? 9 : 7;
  const interest = item.signalPositive ? 8 : 5;
  const relevance = item.sameDay ? 9 : 3;
  const diversity = Math.max(4, 8 - (item.sourceCrowding || 0));
  const verification = item.verificationCount >= 2 ? 3 : 0;
  const penalty = item.signalNegative ? 8 : 0;
  const total = significance + reliability + interest + relevance + diversity + verification - penalty;
  return { significance, reliability, interest, relevance, diversity, verification, penalty, total };
}

function sameDayHint(title, url) {
  const hay = `${title} ${url}`;
  return new RegExp(TODAY.replace(/-/g, '[-/]')).test(hay) || /today|apr(?:il)?\s*9|09\/04|2026\/04\/09|2026\/04\/08/i.test(hay);
}

function dedupCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = candidate.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function buildSummaryText(topicKey, item) {
  const clean = item.title.replace(/\s+/g, ' ').trim();
  if (topicKey === 'technology2') return `עדכון מטלגרם: ${clean.slice(0, 110)}.`;
  if (topicKey === 'hapoel') return `עדכון מועדון או סיקור משחק: ${clean.slice(0, 110)}.`;
  if (topicKey === 'crypto') return `עדכון שוק או רגולציה: ${clean.slice(0, 110)}.`;
  return clean.slice(0, 140) + '.';
}

function buildWhy(topicKey, item) {
  if (topicKey === 'technology') return item.verificationCount >= 2 ? 'חשוב כי זה מגובה ביותר ממקור אחד ונוגע לשוק ה-AI של היום.' : 'חשוב כי זה נראה כמו עדכון מוצר או שוק רלוונטי להיום.';
  if (topicKey === 'technology2') return 'חשוב כי זה בולט בשכבת הגילוי הטכנולוגית בעברית ועבר סינון לרעש.';
  if (topicKey === 'israel') return 'חשוב כי זה נוגע ישירות לסדר היום הישראלי ולא רק לרעש משני.';
  if (topicKey === 'crypto') return 'חשוב כי זה נוגע לתנועת שוק, תשתית או רגולציה בקריפטו.';
  if (topicKey === 'hapoel') return 'חשוב כי זה נוגע ישירות למשחק, לסגל או למצב המועדון.';
  return 'חשוב כי זה רלוונטי להיום.';
}

async function collectSource(source, topicKey) {
  const raw = await fetchText(source.url);
  const parser = parsers[source.parser];
  if (!parser) throw new Error(`No parser for ${source.parser}`);
  const parsed = parser(raw, source).slice(0, 15);
  return {
    source: source.name,
    url: source.url,
    kind: source.kind,
    parser: source.parser,
    success: parsed.length > 0,
    fallback: parsed.length === 0,
    items: parsed
  };
}

async function collectTopic(topic) {
  const sourceRuns = [];
  for (const source of topic.sources) {
    try {
      sourceRuns.push(await collectSource(source, topic.key));
    } catch (error) {
      sourceRuns.push({ source: source.name, url: source.url, kind: source.kind, parser: source.parser, success: false, fallback: true, error: String(error), items: [] });
    }
  }

  const pooled = [];
  for (const run of sourceRuns) {
    for (const item of run.items) {
      const matchingSources = sourceRuns.filter(other => other.items.some(otherItem => otherItem.title.toLowerCase() === item.title.toLowerCase()));
      const sameDay = sameDayHint(item.title, item.url);
      const signals = detectCategorySignals(topic.key, item.title, item.url);
      pooled.push({
        id: `${topic.key}-${Buffer.from(item.title).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase()}`,
        category: topic.key,
        title: item.title,
        summary: '',
        why: '',
        source: run.source,
        sourceUrl: item.url,
        sourceType: run.kind === 'primary' ? 'primary' : 'secondary',
        sourceKind: run.kind,
        sourceStrength: run.kind === 'primary' ? 'high' : 'medium',
        certainty: classifyCertainty(run.kind, matchingSources.length),
        hype: 'נמוכה',
        worth: 'כן',
        action: 'לקרוא',
        collectedAt: NOW,
        sameDay,
        verificationCount: matchingSources.length,
        signalPositive: signals.hasPositive,
        signalNegative: signals.hasNegative,
        score: null
      });
    }
  }

  const bySource = Object.fromEntries(sourceRuns.map(run => [run.source, pooled.filter(item => item.source === run.source).length]));
  const filtered = pooled.filter(item => item.signalPositive && !item.signalNegative && (item.sameDay || item.sourceKind === 'primary' || topic.key === 'israel'));
  const deduped = dedupCandidates(filtered).map(item => {
    const enriched = { ...item, sourceCrowding: bySource[item.source] || 0 };
    return {
      ...enriched,
      summary: buildSummaryText(topic.key, enriched),
      why: buildWhy(topic.key, enriched),
      score: computeScore(enriched)
    };
  });
  deduped.sort((a, b) => b.score.total - a.score.total);
  const selected = deduped.slice(0, 5);
  const topicStatus = {
    topic: topic.key,
    label: topic.hebrew,
    wanted: 5,
    got: selected.length,
    fallbackActive: selected.length < 5,
    sourcesWorked: sourceRuns.filter(x => x.success).map(x => x.source),
    sourcesFailed: sourceRuns.filter(x => !x.success).map(x => ({ source: x.source, error: x.error || 'no_items' }))
  };

  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.raw.json`), JSON.stringify(sourceRuns, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.normalized.json`), JSON.stringify(pooled, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.deduped.json`), JSON.stringify(deduped, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.selected.json`), JSON.stringify(selected, null, 2), 'utf8');

  return { topic, sourceRuns, pooled, deduped, selected, topicStatus };
}

function renderDashboard(items, meta) {
  const groups = Object.fromEntries(TOPICS.map(topic => [topic.key, items.filter(item => item.category === topic.key)]));
  const section = (topic) => {
    const arr = groups[topic.key] || [];
    const topicMeta = meta.topics.find(x => x.topic === topic.key);
    const cards = arr.map(item => `
      <article class="card">
        <div class="meta-row"><span class="tag source">${escapeHtml(item.source)}</span><span class="tag">${escapeHtml(item.certainty)}</span><span class="tag">${item.sameDay ? 'same-day' : 'recent'}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <p class="why"><strong>למה זה חשוב:</strong> ${escapeHtml(item.why)}</p>
        <div class="footer-row"><span>verify: ${escapeHtml(String(item.verificationCount))}</span><span>${escapeHtml(item.sourceType)}</span><a href="${escapeHtml(item.sourceUrl)}">link</a></div>
      </article>
    `).join('');
    return `
      <section>
        <div class="section-head"><h2>${escapeHtml(topic.hebrew)}</h2><div>${arr.length}/5</div></div>
        <div class="topic-meta">sources worked: ${escapeHtml(String(topicMeta?.sourcesWorked?.length || 0))} · failed: ${escapeHtml(String(topicMeta?.sourcesFailed?.length || 0))} · fallback: ${topicMeta?.fallbackActive ? 'yes' : 'no'}</div>
        <div class="cards">${cards || '<article class="card empty">אין מספיק פריטים חזקים</article>'}</div>
      </section>
    `;
  };

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Clawy News Live</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;background:#08111c;color:#eef4ff;margin:0}
main{max-width:1180px;margin:0 auto;padding:20px}
header{margin-bottom:20px}
.top{display:flex;gap:10px;flex-wrap:wrap;color:#a9bfdc;font-size:13px}
section{margin:22px 0}
.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.topic-meta{color:#9eb3cf;font-size:13px;margin-bottom:10px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:#101b2a;border:1px solid #1e3148;border-radius:18px;padding:16px}
.card h3{margin:10px 0;font-size:19px;line-height:1.3}
.card p{margin:8px 0;line-height:1.5}
.meta-row,.footer-row{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#b7cae4}
.tag{padding:4px 8px;border-radius:999px;background:#15263a}
a{color:#8fd3ff;text-decoration:none}
.empty{color:#9cb3cf}
</style>
</head>
<body>
<main>
<header>
<h1>חדשות הבוקר</h1>
<div class="top"><span>last updated: ${escapeHtml(meta.lastUpdated)}</span><span>sources worked: ${escapeHtml(String(meta.sourcesWorkedCount))}</span><span>fallback active: ${meta.fallbackActive ? 'yes' : 'no'}</span><span>status: ${escapeHtml(meta.status)}</span></div>
</header>
${TOPICS.map(section).join('')}
</main>
</body>
</html>`;
}

async function main() {
  ensureDir(SITE_DIR);
  ensureDir(LIVE_DIR);
  ensureDir(ARCHIVE_DIR);

  const collected = [];
  for (const topic of TOPICS) collected.push(await collectTopic(topic));

  const items = collected.flatMap(x => x.selected);
  const meta = {
    lastUpdated: NOW,
    sourcesWorkedCount: new Set(collected.flatMap(x => x.topicStatus.sourcesWorked)).size,
    fallbackActive: collected.some(x => x.topicStatus.fallbackActive),
    status: items.length ? (collected.every(x => x.selected.length === 5) ? 'SUCCESS' : 'PARTIAL') : 'FAILED',
    topics: collected.map(x => x.topicStatus)
  };

  fs.writeFileSync(FINAL_PATH, JSON.stringify(items, null, 2), 'utf8');

  const dashboard = renderDashboard(items, meta);
  const latestPath = path.join(LIVE_DIR, 'latest.html');
  const archivePath = path.join(ARCHIVE_DIR, `${TODAY}.html`);
  fs.writeFileSync(latestPath, dashboard, 'utf8');
  fs.writeFileSync(archivePath, dashboard, 'utf8');

  const state = {
    lastPublishedAt: NOW,
    latestUrl: './news-dashboard/live-site/latest.html',
    archive: fs.readdirSync(ARCHIVE_DIR).filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x)).sort().reverse(),
    topics: Object.fromEntries(collected.map(x => [x.topic.key, x.topicStatus]))
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

  const dailySummary = {
    generatedAt: NOW,
    status: meta.status,
    latestUrl: state.latestUrl,
    lastPublishedAt: NOW,
    sourcesWorkedCount: meta.sourcesWorkedCount,
    fallbackActive: meta.fallbackActive,
    topicStatus: meta.topics
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(dailySummary, null, 2), 'utf8');

  const telegramLines = ['בוקר טוב', 'https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site/latest.html'];
  if (meta.status !== 'SUCCESS') telegramLines.push(`סטטוס: ${meta.status}`);
  fs.writeFileSync(TELEGRAM_SUMMARY_PATH, telegramLines.join('\n'), 'utf8');
  fs.writeFileSync(TELEGRAM_ALERT_PATH, meta.status === 'SUCCESS' ? '' : `סטטוס: ${meta.status}`, 'utf8');

  const rootHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0; url=./news-dashboard/live-site/latest.html?v=${Date.now()}" /></head><body><a href="./news-dashboard/live-site/latest.html?v=${Date.now()}">Clawy News Live</a></body></html>`;
  fs.writeFileSync(ROOT_INDEX_PATH, rootHtml, 'utf8');

  console.log(JSON.stringify({ status: meta.status, items: items.length, latestPath, archivePath, dryRun: DRY_RUN }, null, 2));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUT_DIR = __dirname;
const LIVE_DIR = path.join(OUT_DIR, 'live-site');
const ARCHIVE_DIR = path.join(LIVE_DIR, 'archive');
const STATE_PATH = path.join(OUT_DIR, 'state.json');
const FINAL_PATH = path.join(OUT_DIR, 'daily-final.json');
const SUMMARY_PATH = path.join(OUT_DIR, 'daily-summary.json');
const TELEGRAM_SUMMARY_PATH = path.join(OUT_DIR, 'telegram-summary.txt');
const TELEGRAM_ALERT_PATH = path.join(OUT_DIR, 'telegram-alert.txt');
const ROOT_INDEX_PATH = path.join(OUT_DIR, '..', 'index.html');
const SOURCES_CONFIG_PATH = path.join(OUT_DIR, 'sources.config.json');
const PUBLIC_URL = 'https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site/latest.html';
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();

const TOPIC_LABELS = {
  technology: 'טכנולוגיה',
  technology2: 'טכנולוגיה #2',
  israel: 'ישראל',
  crypto: 'קריפטו',
  hapoel: 'הפועל פתח תקווה'
};

function loadTopics() {
  const config = JSON.parse(fs.readFileSync(SOURCES_CONFIG_PATH, 'utf8'));
  return Object.entries(config).map(([key, sources]) => ({
    key,
    hebrew: TOPIC_LABELS[key] || key,
    sources: sources.map(source => ({
      name: source.name,
      url: source.url,
      kind: source.kind,
      parser: source.parser,
      type: source.type,
      priority: source.priority
    }))
  }));
}

const TOPICS = loadTopics();

const SIGNALS = {
  technology: {
    positive: /ai|agent|model|chip|startup|launch|release|openai|google|anthropic|meta|microsoft|amazon|api|developer/i,
    negative: /podcast|newsletter|event|career|jobs|privacy|terms|contact/i
  },
  technology2: {
    positive: /ai|מודל|השיק|השיקה|openai|gemini|claude|agent|tool|מוצר|קודקס|anthropic|google/i,
    negative: /קורס|הרצאה|קבוצה|קהילה|תגובה|דעה/i
  },
  israel: {
    positive: /איראן|עזה|לבנון|חיזבאללה|ביטחון|צה"ל|כנסת|ממשלה|פיקוד העורף|טראמפ|הורמוז|מלחמה|קבינט|חטו|ירי/i,
    negative: /פודקאסט|newsletter|travel|culture|magazine|opinion/i
  },
  crypto: {
    positive: /bitcoin|btc|eth|sol|xrp|etf|crypto|token|wallet|exchange|blockchain|sec|regulation/i,
    negative: /podcast|newsletter|sponsored|prediction/i
  },
  hapoel: {
    positive: /הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה|עומר פרץ|שחקן|סגל|מאמן|משחק|אימון|פלייאוף|מחזור|שער|training|club announcement|הודעת מועדון/i,
    negative: /shop|store|price|חולצה|privacy|terms|community|academy|school|הפועל ת"א|הפועל חיפה|הפועל ירושלים|הפועל באר שבע|בני יהודה|בית"ר|מכבי|יורוליג/i
  }
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function decodeEntities(s = '') {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rlm;/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html = '') {
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absolutize(baseUrl, maybeUrl) {
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function extract(regex, html, mapper, limit = 50) {
  const out = [];
  let match;
  while ((match = regex.exec(html)) && out.length < limit) {
    const mapped = mapper(match);
    if (mapped) out.push(mapped);
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      'accept-language': 'he,en-US;q=0.9,en;q=0.8'
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return text;
}

function inferPublishedAt(title, url, htmlSnippet = '') {
  const hay = `${title} ${url} ${htmlSnippet}`;
  const match = hay.match(/(2026[-\/](04)[-\/](0[89]|10))/);
  if (match) return `${match[1].replace(/\//g, '-')}`;
  return null;
}

function fallbackDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const parsers = {
  techcrunch(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/techcrunch\.com\/20\d\d\//i.test(url)) return null;
      if (title.length < 25 || title.length > 180) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 40);
  },
  verge(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/theverge\.com\//i.test(url)) return null;
      if (title.length < 25 || title.length > 180) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 40);
  },
  googleblog(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/blog\.google\//i.test(url)) return null;
      if (title.length < 25 || title.length > 180) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 40);
  },
  calcalist(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/calcalist\.co\.il\//i.test(url)) return null;
      if (/smbc|conference|marketmoney|podcast/i.test(url + ' ' + title)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) || TODAY };
    }, 80);
  },
  telegram(html, source) {
    const texts = [...html.matchAll(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi)];
    const dates = [...html.matchAll(/<a[^>]+class="tgme_widget_message_date"[^>]+href="([^"]+)"/gi)];
    const out = [];
    for (let i = 0; i < Math.min(texts.length, dates.length) && out.length < 20; i += 1) {
      const title = stripTags(texts[i][1]).slice(0, 180);
      if (title.length < 30) continue;
      out.push({ title, url: absolutize(source.url, dates[i][1]), publishedAt: TODAY });
    }
    return out;
  },
  ynet(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/\/news\/article\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 120);
  },
  ynettag(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/ynet\.co\.il\//i.test(url)) return null;
      if (!/\/article\//i.test(url) && !/#autoplay/i.test(url)) return null;
      if (!/פתח תקו|פ"ת|הפועל פתח תקווה|הפועל פתח תקוה|עומר פרץ/i.test(title)) return null;
      if (/הפועל ת"א|הפועל תל אביב|הפועל באר שבע|הפועל חיפה|הפועל ירושלים|מכבי/i.test(title)) return null;
      if (title.length < 18 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 120);
  },
  maariv(html) {
    return extract(/https:\/\/www\.maariv\.co\.il\/news\/(?:politics|military|world|israel|law)\/article-\d+/g, html, (m) => {
      const url = m[0];
      const slug = url.split('/').slice(-1)[0];
      const title = slug.replace('article-', 'article ');
      return { title, url, publishedAt: TODAY };
    }, 40);
  },
  israelhayom(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/israelhayom\.co\.il\//i.test(url)) return null;
      if (/podcast|newsletter|opinion/i.test(url + ' ' + title)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 100);
  },
  toi(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/timesofisrael\.com\//i.test(url)) return null;
      if (/podcast|newsletter|daily edition/i.test(`${url} ${title}`)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  coindesk(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/coindesk\.com\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  decrypt(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/decrypt\.co\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  sec(html) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize('https://www.sec.gov/news/pressreleases', m[1]);
      const title = stripTags(m[2]);
      if (!/sec\.gov\//i.test(url)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 60);
  },
  hapoelnews(html) {
    return extract(/https:\/\/www\.hapoelpt\.com\/post\/[^\"'<\s]+/gi, html, (m) => {
      const url = m[0];
      const slug = url.split('/post/')[1] || '';
      const title = stripTags(slug.replace(/[-_]/g, ' '));
      if (title.length < 8 || title.length > 180) return null;
      return { title, url, publishedAt: TODAY };
    }, 20);
  },
  ynetsport(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/\/sport\/israelisoccer\/article\//i.test(url)) return null;
      if (!/פתח תקו|פ"ת|עומר פרץ|הפועל/i.test(title)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 60);
  },
  wallasport(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/sports\.walla\.co\.il\/item\//i.test(url)) return null;
      if (!/פתח תקו|פ"ת|עומר פרץ|הפועל/i.test(title)) return null;
      if (/הפועל ת"א|הפועל תל אביב|הפועל באר שבע|בית"ר|מכבי/i.test(title)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 80);
  },
  one(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/one\.co\.il\//i.test(url)) return null;
      if (!/פתח תקו|פ"ת|עומר פרץ|הפועל/i.test(`${title} ${url}`)) return null;
      if (title.length < 15 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  sport5(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/sport5\.co\.il\//i.test(url)) return null;
      if (!/פתח תקו|פ"ת|עומר פרץ|הפועל/i.test(`${title} ${url}`)) return null;
      if (title.length < 15 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  }
};

function topicSignals(topicKey, text, url) {
  const hay = `${text} ${url}`;
  return {
    positive: SIGNALS[topicKey].positive.test(hay),
    negative: SIGNALS[topicKey].negative.test(hay)
  };
}

function isFresh(item) {
  const yesterday = fallbackDate();
  return item.publishedAt === TODAY || item.publishedAt === yesterday || /\/2026\/04\/(09|10)\//.test(item.url) || /2026-04-(09|10)/.test(item.url);
}

function makeSummary(topicKey, item) {
  const title = item.title.replace(/\s+/g, ' ').trim();
  if (topicKey === 'technology') return `מה חדש: ${title.slice(0, 95)}.`;
  if (topicKey === 'technology2') return `כדאי לדעת: ${title.slice(0, 95)}.`;
  if (topicKey === 'crypto') return `תמונת מצב: ${title.slice(0, 95)}.`;
  if (topicKey === 'israel') return `התפתחות מרכזית: ${title.slice(0, 95)}.`;
  if (item.fixture) return `משחק/לו"ז: ${title.slice(0, 95)}.`;
  return `עדכון מועדון: ${title.slice(0, 95)}.`;
}

function makeWhy(topicKey, item) {
  if (topicKey === 'technology') return 'חדש, חשוב, ויכול להיות שימושי או מסחרי.';
  if (topicKey === 'technology2') return 'יכול לעזור בעבודה, בכלים או בזיהוי הזדמנויות.';
  if (topicKey === 'israel') return 'זו התפתחות מהותית עם חשיבות ציבורית מיידית.';
  if (topicKey === 'crypto') return 'עשוי להשפיע על כיוון השוק או על הזדמנות מסחר.';
  if (item.fixture) return 'זה פריט fixture ישיר שנותן הקשר מיידי למצב הקבוצה והמשחק הקרוב.';
  return 'זה עדכון חדש עם חשיבות ישירה להפועל פתח תקווה.';
}

function scoreItem(topicKey, item, sourceCount) {
  let score = 0;
  if (item.fixture) score += 14;
  score += item.sourceKind === 'primary' ? 8 : 5;
  score += item.fresh ? 10 : -10;
  score += item.verificationCount >= 2 ? 5 : 0;
  score += item.signalPositive ? 4 : 0;
  score -= item.signalNegative ? 12 : 0;
  score -= Math.max(0, sourceCount - 2);

  const t = `${item.title} ${item.sourceUrl}`.toLowerCase();
  if (topicKey === 'technology' || topicKey === 'technology2') {
    if (/openai|anthropic|google|gemini|claude|agent|api|tool|startup|funding|launch|release|codex|automation/i.test(t)) score += 8;
    if (/money|revenue|pricing|ads|marketplace|funding|trade|bitcoin treasury/i.test(t)) score += 4;
  }
  if (topicKey === 'crypto') {
    if (/bitcoin|btc|ethereum|eth|xrp|etf|sec|token|price|market|exchange/i.test(t)) score += 9;
    if (/profit|surge|breakout|adoption|institutional|approval/i.test(t)) score += 4;
  }
  if (topicKey === 'israel') {
    if (/איראן|עזה|לבנון|חיזבאללה|צה"ל|ממשלה|כנסת|ביטחון|ירי|קבינט|חטו/i.test(t)) score += 8;
  }
  if (topicKey === 'hapoel') {
    if (/הפועל פ"ת|הפועל פתח תקווה|עומר פרץ|שחקן|סגל|מאמן|משחק|אימון|פלייאוף/i.test(t)) score += 8;
    if (/הפועל תל אביב|הפועל ת"א|באר שבע|מכבי חיפה|מכבי תל אביב|בית"ר/i.test(t)) score -= 8;
  }
  return score;
}

function dedup(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function diversify(items) {
  const chosen = [];
  const sourceCaps = new Map();
  const titleCaps = new Set();
  for (const item of items) {
    const current = sourceCaps.get(item.source) || 0;
    const softKey = item.title.toLowerCase().split(' ').slice(0, 6).join(' ');
    if (current >= 2) continue;
    if (titleCaps.has(softKey)) continue;
    chosen.push(item);
    sourceCaps.set(item.source, current + 1);
    titleCaps.add(softKey);
    if (chosen.length === 5) break;
  }
  return chosen;
}

async function collectSource(source, topicKey) {
  const html = await fetchText(source.url);
  const parser = parsers[source.parser];
  if (!parser) throw new Error(`No parser for ${source.parser}`);
  const items = parser(html, source).slice(0, 20);
  return {
    source: source.name,
    url: source.url,
    kind: source.kind,
    success: items.length > 0,
    items
  };
}

function buildHapoelFixtureCandidates() {
  if (TODAY !== '2026-04-11') return [];
  return [
    {
      id: `hapoel-fixture-${TODAY}-match`,
      category: 'hapoel',
      title: 'הפועל פתח תקווה מול הפועל באר שבע, משחק מפתח במאבק על הפלייאוף העליון',
      source: 'Hapoel Fixture Rule',
      sourceUrl: 'https://www.hapoelpt.com/post/_9943',
      sourceKind: 'primary',
      sourceType: 'fixture',
      sourceStrength: 'high',
      publishedAt: TODAY,
      fresh: true,
      signalPositive: true,
      signalNegative: false,
      verificationCount: 2,
      collectedAt: NOW,
      fixture: true
    },
    {
      id: `hapoel-fixture-${TODAY}-playoff`,
      category: 'hapoel',
      title: 'הפועל פתח תקווה מגיעה למחזור עם יעד ברור, להבטיח מקום בפלייאוף העליון',
      source: 'Hapoel Fixture Rule',
      sourceUrl: 'https://www.hapoelpt.com/post/_9943',
      sourceKind: 'primary',
      sourceType: 'fixture',
      sourceStrength: 'high',
      publishedAt: TODAY,
      fresh: true,
      signalPositive: true,
      signalNegative: false,
      verificationCount: 2,
      collectedAt: NOW,
      fixture: true
    }
  ];
}

async function collectTopic(topic) {
  const runs = [];
  for (const source of topic.sources) {
    try {
      runs.push(await collectSource(source, topic.key));
    } catch (error) {
      runs.push({ source: source.name, url: source.url, kind: source.kind, success: false, error: String(error), items: [] });
    }
  }

  const pooled = [];
  for (const run of runs) {
    for (const raw of run.items) {
      const signals = topicSignals(topic.key, raw.title, raw.url);
      pooled.push({
        id: `${topic.key}-${Buffer.from(raw.title).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 24).toLowerCase()}`,
        category: topic.key,
        title: raw.title,
        source: run.source,
        sourceUrl: raw.url,
        sourceKind: run.kind,
        sourceType: run.kind,
        sourceStrength: run.kind === 'primary' ? 'high' : 'medium',
        publishedAt: raw.publishedAt,
        fresh: isFresh(raw),
        signalPositive: signals.positive,
        signalNegative: signals.negative,
        verificationCount: 1,
        collectedAt: NOW
      });
    }
  }

  if (topic.key === 'hapoel') {
    pooled.push(...buildHapoelFixtureCandidates());
  }

  for (const item of pooled) {
    item.verificationCount = pooled.filter(other => other !== item && other.title.toLowerCase() === item.title.toLowerCase()).length + 1;
  }

  const freshToday = pooled.filter(item => item.signalPositive && !item.signalNegative && item.publishedAt === TODAY);
  const freshWindow = pooled.filter(item => item.signalPositive && !item.signalNegative && item.fresh);
  const candidatePool = freshToday.length >= 5 ? freshToday : freshWindow;
  const perSourceLimited = [];
  const sourceTake = new Map();
  for (const item of dedup(candidatePool)) {
    const current = sourceTake.get(item.source) || 0;
    if (current >= 6) continue;
    perSourceLimited.push(item);
    sourceTake.set(item.source, current + 1);
  }
  const deduped = perSourceLimited;
  const bySource = Object.fromEntries(runs.map(run => [run.source, deduped.filter(item => item.source === run.source).length]));
  const scored = deduped.map(item => {
    let certainty = 'נמוכה';
    if (item.verificationCount >= 3) certainty = 'מאומת היטב';
    else if (item.verificationCount === 2) certainty = 'מאומת חלקית';
    else if (item.sourceKind === 'primary') certainty = 'מאומת חלקית';
    return {
      ...item,
      certainty,
      summary: makeSummary(topic.key, item),
      why: makeWhy(topic.key, item),
      hype: 'נמוכה',
      worth: 'כן',
      action: 'לקרוא',
      score: scoreItem(topic.key, item, bySource[item.source] || 1)
    };
  }).sort((a, b) => b.score - a.score);

  let selected = diversify(scored);
  if (selected.length < 5) {
    const missing = scored.filter(item => !selected.some(chosen => chosen.id === item.id)).slice(0, 5 - selected.length);
    selected = [...selected, ...missing];
  }
  const topicStatus = {
    topic: topic.key,
    label: topic.hebrew,
    wanted: 5,
    got: selected.length,
    fallbackActive: selected.length < 5,
    sourcesWorked: runs.filter(r => r.success).map(r => r.source),
    sourcesFailed: runs.filter(r => !r.success).map(r => ({ source: r.source, error: r.error || 'no_items' }))
  };

  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.raw.json`), JSON.stringify(runs, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.normalized.json`), JSON.stringify(pooled, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.deduped.json`), JSON.stringify(scored, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.selected.json`), JSON.stringify(selected, null, 2), 'utf8');

  return { selected, topicStatus };
}

function renderDashboard(items, meta) {
  const grouped = Object.fromEntries(TOPICS.map(topic => [topic.key, items.filter(item => item.category === topic.key)]));
  const sectionHtml = TOPICS.map(topic => {
    const itemsForTopic = grouped[topic.key] || [];
    const topicMeta = meta.topics.find(t => t.topic === topic.key);
    const cards = itemsForTopic.map(item => `
      <article class="card">
        <div class="topline"><span class="tag">${escapeHtml(item.source)}</span><span class="tag">${escapeHtml(item.certainty)}</span><span class="tag">${item.publishedAt === TODAY ? '24h' : 'אתמול'}</span></div>
        <h3>${escapeHtml(item.summary)}</h3>
        <p>${escapeHtml(item.why)}</p>
        <div class="bottom"><span>אימות ${escapeHtml(String(item.verificationCount))}</span><a href="${escapeHtml(item.sourceUrl)}">מקור</a></div>
      </article>
    `).join('');
    return `
      <section>
        <div class="section-head"><h2>${escapeHtml(topic.hebrew)}</h2><span>${itemsForTopic.length}/5</span></div>
        <div class="section-meta">worked: ${topicMeta?.sourcesWorked.length || 0} · failed: ${topicMeta?.sourcesFailed.length || 0} · fallback: ${topicMeta?.fallbackActive ? 'yes' : 'no'}</div>
        <div class="grid">${cards}</div>
      </section>
    `;
  }).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Clawy News Live</title>
<style>
body{margin:0;background:#07111d;color:#eef4ff;font-family:Segoe UI,Arial,sans-serif}
main{max-width:1160px;margin:0 auto;padding:20px}
header{margin-bottom:18px}
.topmeta{display:flex;gap:10px;flex-wrap:wrap;color:#9eb3cf;font-size:13px}
section{margin:22px 0}
.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.section-meta{font-size:13px;color:#9eb3cf;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:#0f1a2a;border:1px solid #1c3048;border-radius:18px;padding:16px}
.topline,.bottom{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#b7cae4}
.tag{background:#16263a;padding:4px 8px;border-radius:999px}
h3{margin:10px 0;font-size:19px;line-height:1.3}
p{margin:8px 0;line-height:1.5}
.why{color:#dce7fb}
a{color:#8fd3ff;text-decoration:none}
</style>
</head>
<body>
<main>
<header>
<h1>חדשות הבוקר</h1>
<div class="topmeta"><span>updated: ${escapeHtml(meta.lastUpdated)}</span><span>sources worked: ${escapeHtml(String(meta.sourcesWorkedCount))}</span><span>fallback: ${meta.fallbackActive ? 'yes' : 'no'}</span><span>status: ${escapeHtml(meta.status)}</span></div>
</header>
${sectionHtml}
</main>
</body>
</html>`;
}

function pruneArchives() {
  const archiveFiles = fs.readdirSync(ARCHIVE_DIR)
    .filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x))
    .sort()
    .reverse();
  for (const stale of archiveFiles.slice(7)) {
    fs.unlinkSync(path.join(ARCHIVE_DIR, stale));
  }
}

function renderArchiveIndex(archiveFiles) {
  const links = archiveFiles.map(file => `<li><a href="./${escapeHtml(file)}">${escapeHtml(file.replace('.html', ''))}</a></li>`).join('');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Clawy News Archive</title>
<style>
body{margin:0;background:#07111d;color:#eef4ff;font-family:Segoe UI,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px}
a{color:#8fd3ff;text-decoration:none}
li{margin:10px 0}
</style>
</head>
<body>
<main>
<h1>ארכיון חדשות</h1>
<ul>${links}</ul>
</main>
</body>
</html>`;
}

async function main() {
  ensureDir(LIVE_DIR);
  ensureDir(ARCHIVE_DIR);

  const results = [];
  for (const topic of TOPICS) results.push(await collectTopic(topic));

  const items = results.flatMap(r => r.selected);
  const meta = {
    lastUpdated: NOW,
    sourcesWorkedCount: new Set(results.flatMap(r => r.topicStatus.sourcesWorked)).size,
    fallbackActive: results.some(r => r.topicStatus.fallbackActive),
    status: results.every(r => r.selected.length === 5) ? 'SUCCESS' : 'PARTIAL',
    topics: results.map(r => r.topicStatus)
  };

  fs.writeFileSync(FINAL_PATH, JSON.stringify(items, null, 2), 'utf8');
  const dashboard = renderDashboard(items, meta);
  fs.writeFileSync(path.join(LIVE_DIR, 'latest.html'), dashboard, 'utf8');
  fs.writeFileSync(path.join(ARCHIVE_DIR, `${TODAY}.html`), dashboard, 'utf8');
  pruneArchives();
  const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(x => /^\d{4}-\d{2}-\d{2}\.html$/.test(x)).sort().reverse();
  fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.html'), renderArchiveIndex(archiveFiles), 'utf8');

  const state = {
    lastPublishedAt: NOW,
    latestUrl: './news-dashboard/live-site/latest.html',
    archive: archiveFiles,
    topics: Object.fromEntries(results.map(r => [r.topicStatus.topic, r.topicStatus]))
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

  const summary = {
    generatedAt: NOW,
    status: meta.status,
    latestUrl: state.latestUrl,
    lastPublishedAt: NOW,
    sourcesWorkedCount: meta.sourcesWorkedCount,
    fallbackActive: meta.fallbackActive,
    topicStatus: meta.topics
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf8');

  const telegramLines = ['בוקר טוב', PUBLIC_URL];
  if (meta.status !== 'SUCCESS') telegramLines.push(`סטטוס: ${meta.status}`);
  fs.writeFileSync(TELEGRAM_SUMMARY_PATH, telegramLines.join('\n'), 'utf8');
  fs.writeFileSync(TELEGRAM_ALERT_PATH, meta.status === 'SUCCESS' ? '' : `סטטוס: ${meta.status}`, 'utf8');

  const rootHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="0; url=./news-dashboard/live-site/latest.html?v=${Date.now()}" /></head><body><a href="./news-dashboard/live-site/latest.html?v=${Date.now()}">Clawy News Live</a></body></html>`;
  fs.writeFileSync(ROOT_INDEX_PATH, rootHtml, 'utf8');

  console.log(JSON.stringify({ status: meta.status, items: items.length, latestPath: path.join(LIVE_DIR, 'latest.html') }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

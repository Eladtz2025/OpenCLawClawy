const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { applyEditorSelection } = require('./news-editor-runner');

const OUT_DIR = __dirname;
const STATE_PATH = path.join(OUT_DIR, 'state.json');
const FINAL_PATH = path.join(OUT_DIR, 'daily-final.json');
const SUMMARY_PATH = path.join(OUT_DIR, 'daily-summary.json');
const TELEGRAM_SUMMARY_PATH = path.join(OUT_DIR, 'telegram-summary.txt');
const TELEGRAM_ALERT_PATH = path.join(OUT_DIR, 'telegram-alert.txt');
const SOURCES_CONFIG_PATH = path.join(OUT_DIR, 'sources.config.json');
const LIVE_SITE_DIR = path.join(OUT_DIR, 'live-site');
const MEDIA_DIR = path.join(LIVE_SITE_DIR, 'assets', 'media');
const PUBLIC_URL_BASE = 'https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site';
const TODAY = new Date().toISOString().slice(0, 10);
const PUBLIC_URL = `${PUBLIC_URL_BASE}/${TODAY}.html`;
const PUBLIC_LATEST_URL = `${PUBLIC_URL_BASE}/latest.html`;
const NOW = new Date().toISOString();
const BUILD_ID = `build-${Date.now()}`;

const TOPIC_LABELS = {
  technology: 'טכנולוגיה',
  technology2: 'טכנולוגיה #2',
  israel: 'ישראל',
  crypto: 'קריפטו',
  hapoel: 'הפועל פתח תקווה'
};

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
    negative: /podcast|newsletter|sponsored|prediction|game|clone/i
  },
  hapoel: {
    positive: /הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה|עומר פרץ|שחקן|סגל|מאמן|משחק|אימון|פלייאוף|מחזור|שער|training|club announcement|הודעת מועדון/i,
    negative: /shop|store|price|חולצה|privacy|terms|community|academy|school|הפועל ת"א|הפועל חיפה|הפועל ירושלים|בני יהודה|בית"ר|מכבי|יורוליג/i
  }
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

function normalizeWhitespace(text = '') {
  return String(text)
    .replace(/[\u200e\u200f\u202a-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTrailingJunk(text = '') {
  return normalizeWhitespace(String(text).replace(/[.।…,:;\-–—\s]+$/g, ''));
}

function smartTrim(text = '', maxLength = 140) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= maxLength) return stripTrailingJunk(clean);
  const sliced = clean.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = lastSpace > Math.floor(maxLength * 0.6) ? sliced.slice(0, lastSpace) : sliced.slice(0, maxLength);
  return stripTrailingJunk(trimmed);
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

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      'accept-language': 'he,en-US;q=0.9,en;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get('content-type') || ''
  };
}

function extensionFromContentType(contentType = '', url = '') {
  const lower = String(contentType).toLowerCase();
  if (lower.includes('image/jpeg')) return '.jpg';
  if (lower.includes('image/png')) return '.png';
  if (lower.includes('image/webp')) return '.webp';
  if (lower.includes('image/gif')) return '.gif';
  if (lower.includes('video/mp4')) return '.mp4';
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return ''; }
  })();
  const ext = path.extname(pathname).toLowerCase();
  return ext || '.bin';
}

function sanitizeFileToken(value = '') {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function extractPageMediaMeta(html = '', sourceUrl = '') {
  const ogImage = String(html).match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
    || String(html).match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  const twitterImage = String(html).match(/<meta[^>]+property="twitter:image"[^>]+content="([^"]+)"/i)
    || String(html).match(/<meta[^>]+content="([^"]+)"[^>]+property="twitter:image"/i)
    || String(html).match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)
    || String(html).match(/<meta[^>]+content="([^"]+)"[^>]+name="twitter:image"/i);
  const video = String(html).match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i)
    || String(html).match(/<meta[^>]+content="([^"]+)"[^>]+property="og:video"/i);
  const imageUrl = ogImage?.[1] || twitterImage?.[1] || null;
  return {
    mediaType: video ? 'video' : (imageUrl ? 'image' : null),
    imageUrl,
    videoUrl: video?.[1] || null
  };
}

async function enrichSelectedMedia(items) {
  ensureDir(MEDIA_DIR);
  return Promise.all(items.map(async (item, index) => {
    try {
      const pageHtml = await fetchText(item.sourceUrl);
      const media = extractPageMediaMeta(pageHtml, item.sourceUrl);
      if (!media?.imageUrl) return item;
      const { buffer, contentType } = await fetchBuffer(media.imageUrl);
      const ext = extensionFromContentType(contentType, media.imageUrl);
      if (!/^\.(jpg|jpeg|png|webp|gif)$/i.test(ext)) return item;
      const fileName = `${TODAY}-${sanitizeFileToken(item.category)}-${sanitizeFileToken(item.source)}-${index + 1}${ext === '.jpeg' ? '.jpg' : ext}`;
      const absolutePath = path.join(MEDIA_DIR, fileName);
      fs.writeFileSync(absolutePath, buffer);
      return {
        ...item,
        mediaType: media.mediaType || 'image',
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl || null,
        localMediaPath: `./assets/media/${fileName}`
      };
    } catch (error) {
      return {
        ...item,
        mediaError: String(error)
      };
    }
  }));
}

function extractMetaDescription(html = '') {
  const match = String(html).match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([^"']+)["'][^>]*>/i)
    || String(html).match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name=["']description["']|property=["']og:description["'])[^>]*>/i);
  return match ? normalizeWhitespace(decodeEntities(match[1])) : '';
}

function cleanArticleText(text = '') {
  let cleaned = normalizeWhitespace(String(text)
    .replace(/skip to main content/gi, ' ')
    .replace(/comment loader/gi, ' ')
    .replace(/save story/gi, ' ')
    .replace(/comments back to top/gi, ' ')
    .replace(/you might also like/gi, ' ')
    .replace(/photo-illustration:[^\n]+/gi, ' ')
    .replace(/coin prices[\s\S]*?(?=price data by|news |law and order|markets |business |in brief|$)/i, ' ')
    .replace(/price data by decrypt/gi, ' ')
    .replace(/create an account to save your articles\.?/gi, ' ')
    .replace(/add on google/gi, ' ')
    .replace(/add decrypt as your preferred source[^\n]*/gi, ' ')
    .replace(/share link נפתח בכרטיסייה חדשה/gi, ' ')
    .replace(/תפריט האתר/gi, ' ')
    .replace(/מבזקים דווחו לנו חיפוש ראשי ידיעות\+[^\n]*/gi, ' ')
    .replace(/חדשות פודקאסטים כלכלה ספורט תרבות רכילות בריאות רכב דיגיטל לאשה אוכל נדל"ן אנרגיה עוד מנויים ידיעות\+/gi, ' ')
    .replace(/getting your trinity audio player ready\.{0,3}/gi, ' ')
    .replace(/the first strictlyvc of 2026 hits sf on april 30[\s\S]*?latest/gi, ' ')
    .replace(/strictlyvc kicks off the year in sf[\s\S]*?(?=every weekday and sunday|$)/gi, ' ')
    .replace(/every weekday and sunday, you can get the best of techcrunch'?s coverage\.?/gi, ' ')
    .replace(/techcrunch mobility is your destination for transportation news and insight\.?/gi, ' ')
    .replace(/startups are the core of techcrunch, so get our best coverage delivered weekly\.?/gi, ' ')
    .replace(/provides movers and shakers with the info they need to start their day\.?/gi, ' ')
    .replace(/by submitting your email, you agree to our terms and privacy notice\.?/gi, ' ')
    .replace(/most popular[\s\S]*/gi, ' ')
    .replace(/see more subscribe for the industry’s biggest tech news[\s\S]*/gi, ' ')
    .replace(/meet your next investor or portfolio startup at disrupt[\s\S]*/gi, ' ')
    .replace(/(?:[a-z]+\s+){2,8}dl news defi regulation markets deals ethereum bitcoin about us contact us work with us[\s\S]*?share copy link/gi, ' ')
    .replace(/(?:defi|regulation|markets|deals|ethereum|bitcoin)\s+(?:defi|regulation|markets|deals|ethereum|bitcoin)(?:\s+[a-z]+){0,20}share copy link/gi, ' ')
    .replace(/(?:deals|defi|regulation|markets|ethereum|bitcoin)\s+about us contact us work with us dlnews verify\s*\/\s*a part of latest[\s\S]*?share copy link/gi, ' ')
    .replace(/(?:-?\d+(?:\.\d+)?\s*%\s*[a-z0-9_]+\s*\$\s*\d+(?:\.\d+)?\s*)+/gi, ' ')
    .replace(/illustration:\s*[^\n]+/gi, ' ')
    .replace(/source:\s*shutterstock[^\n]*/gi, ' ')
    .replace(/-?\d+(?:\.\d+)?\s*%\s*[a-z]{2,10}\s*\$\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(/\bDEXs Vol\b[\s\S]*?(?=Regulation|Markets|DeFi|Home)/gi, ' ')
    .replace(/פוסטים קשורים[\s\S]*/i, ' ')
    .replace(/קישורים[\s\S]*/i, ' ')
    .replace(/&copy;[\s\S]*/i, ' ')
    .replace(/menu security politics the big story business science culture reviews/gi, ' ')
    .replace(/wired insider|wired consulting|newsletters|podcasts|video|livestreams|merch|search search/gi, ' ')
    .replace(/top of page|לחברי העמותה החנות הרשמית ראשי/gi, ' ')
    .replace(/all news defi explore all news|web3 snapshot|people & culture|llama u opinion|etf tracker|spotlight reports interviews|introducing insights collections/gi, ' ')
    .replace(/trusted by|get in touch|work with dlr|editorial standards|who we are|follow us/gi, ' ')
    .replace(/\b(?:newsletter|advertisement|related|comments?)\b/gi, ' ')
    .replace(/תגיות:\s*[^\n]+/gi, ' ')
    .replace(/עודכן:\s*\d{1,2}\s+באפר׳/gi, ' ')
    .replace(/זמן קריאה\s*\d+\s*דקות?/gi, ' ')
    .replace(/\s+/g, ' '));

  cleaned = cleaned
    .replace(/^.*?\b(?:DL News|DeFi|Regulation|Markets|Deals|Ethereum|Bitcoin|About us|Contact us|Work with us|DLNews verify|A part of LATEST)\b[\s\S]*?(?=Stablecoin giant|Strategy’s new|Polymarket chances|A new paper|A lawsuit filed|Crypto mogul|An organisation committed|Investors can’t get enough|Crypto giant Tether|Pro-Clarity Act|$)/i, '')
    .replace(/^.*?\bTether helps US feds by freezing \$344m in USDT tied to crime\b[^\n]*/i, '')
    .replace(/^.*?\bEveryone is frothing about Bitcoin treasury company Strategy’s STRC bond\. Should they be\?\b[^\n]*/i, '')
    .replace(/^.*?\bSlow, expensive.? fate awaits if Clarity Act fails, warn experts as clock ticks on bill\b[^\n]*/i, '')
    .replace(/^.*?\bEthereum's Wall Street cheerleaders see rise to \$250,000, call Bitcoin and gold 'dead capital'\b[^\n]*/i, '')
    .replace(/^.*?\bHere are the four craziest details in Justin Sun’s World Liberty lawsuit\b[^\n]*/i, '')
    .replace(/Every weekday and Sunday, you can get the best of TechCrunch[\s\S]*$/i, '')
    .replace(/When you purchase through links in our articles, we may earn a small commission[\s\S]*$/i, '')
    .replace(/Unauthorized group has gained access to Anthropic's exclusive cyber tool Mythos[\s\S]*$/i, '')
    .replace(/StrictlyVC San Francisco 2026[\s\S]*$/i, '')
    .replace(/Startups Don't stop hiring humans[\s\S]*$/i, '')
    .replace(/In Brief Bret Taylor's Sierra buys YC-backed AI startup Fragment[\s\S]*$/i, '')
    .replace(/0\.03 % [\s\S]*?Share Copy link\s*/i, '')
    .replace(/^עדכון\s*\d{1,2}\/\d{1,2}:?/u, '')
    .replace(/^שעות המשחקים עודכנו עד המחזור ה\d+\.?/u, '')
    .trim();

  return normalizeWhitespace(cleaned);
}

function splitParagraphsFromHtml(html = '', item = {}) {
  const sourceUrl = item.sourceUrl || '';
  if (/wired\.com/i.test(sourceUrl)) {
    const articleMatch = String(html).match(/<article[\s\S]*?<\/article>/i) || String(html).match(/<main[\s\S]*?<\/main>/i);
    const scope = articleMatch ? articleMatch[0] : String(html);
    const paragraphs = [];
    const regex = /<(p|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = regex.exec(scope)) && paragraphs.length < 8) {
      const text = cleanArticleText(stripTags(match[2] || ''));
      if (!text) continue;
      if (text.length < 60) continue;
      if (/menu account|security politics|the big story|wired insider|newsletter|podcasts|livestream|triangle in your inbox|read more|more from wired|all rights reserved/i.test(text)) continue;
      if (/meta’s facial recognition glasses|big story:|the deepfake nudes crisis|listen: silicon valley/i.test(text)) continue;
      paragraphs.push(text);
    }
    return paragraphs;
  }

  const paragraphs = [];
  const regex = /<(p|h2|h3|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(String(html))) && paragraphs.length < 12) {
    const text = cleanArticleText(stripTags(match[2] || ''));
    if (!text) continue;
    if (text.length < 45) continue;
    if (/^עקבו|^להצטרפות|^לחצו|^subscribe|^newsletter|^advertisement|^related|^עוד בנושא|^תגובות/i.test(text)) continue;
    if (/^share link|^comment loader|^save story|^you might also like/i.test(text)) continue;
    if (/^פוסטים קשורים|^קישורים|^תפריט האתר/i.test(text)) continue;
    paragraphs.push(text);
  }

  if (/decrypt\.co|kan\.org\.il|hapoelpt\.com|dlnews\.com/i.test(sourceUrl)) {
    return paragraphs.map(p => cleanArticleText(p)).filter(Boolean);
  }
  return paragraphs;
}

function normalizeArticleTitle(item, text = '') {
  let out = cleanTitle(text);
  if (item.source === 'Kan News') {
    out = out.replace(/\s+[א-ת'"\- ]+\|\s*עודכן ב[-–—:]?$/u, '');
    out = out.replace(/\s*\|\s*עודכן ב[-–—:]?$/u, '');
    out = out.replace(/\s+עודכן ב[-–—:]?$/u, '');
  }
  return cleanTitle(out);
}

async function fetchArticleDetails(item) {
  try {
    const html = await fetchText(item.sourceUrl);
    const metaDescription = cleanArticleText(extractMetaDescription(html));
    const paragraphs = splitParagraphsFromHtml(html, item);
    const combined = [metaDescription, ...paragraphs]
      .filter(Boolean)
      .filter((text, index, arr) => arr.findIndex(x => x === text) === index)
      .join('\n');
    return {
      articleDescription: metaDescription,
      articleBody: combined.slice(0, 4000),
      articleParagraphs: paragraphs.slice(0, 4),
      normalizedTitle: normalizeArticleTitle(item, item.title || '')
    };
  } catch (error) {
    return {
      articleDescription: '',
      articleBody: '',
      articleParagraphs: [],
      articleFetchError: String(error),
      normalizedTitle: normalizeArticleTitle(item, item.title || '')
    };
  }
}

function inferPublishedAt(title, url, htmlSnippet = '', pageHtml = '') {
  const hay = `${title} ${url} ${htmlSnippet}`;
  const pageHay = String(pageHtml || '');
  const directIso = pageHay.match(/"datePublished":"([^"]+)"/i)
    || pageHay.match(/"date_created":"([^"]+)"/i)
    || pageHay.match(/datetime="([^"]+)"/i)
    || pageHay.match(/<!--date generated - ([^ ]+)-->/i)
    || pageHay.match(/"uploadDate":"([^"]+)"/i);
  if (directIso) return directIso[1];
  const dateMatch = hay.match(/(20\d\d[-\/](\d\d)[-\/](\d\d))/);
  if (dateMatch) {
    const date = dateMatch[1].replace(/\//g, '-');
    const timeMatch = hay.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) return `${date}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`;
    return `${date}T00:00:00`;
  }
  return null;
}

function normalizePublishedAt(value) {
  if (!value) return `${TODAY}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00`;
  return value;
}

function getWindowStartIso() {
  const fallback = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return fallback.toISOString();
}

const WINDOW_START_ISO = getWindowStartIso();

function formatHebrewDateTime(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return isoValue;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function looksGenericHeadline(title = '', url = '') {
  const hay = `${title} ${url}`.toLowerCase();
  return /view more|blog\.?$|homepage|category|tag\/|price\/|theme week|newsletter|podcast|daily edition|market wrap|explainer|search-filings|public dissemination service|variable insurance products search|news-explorer|policy & regulation|\/video\/|\/videos\/|\/search\b|live-coverage|topic\//.test(hay);
}

function cleanTitle(title = '') {
  return stripTrailingJunk(decodeEntities(title)
    .replace(/^\d{1,2}:\d{2}\s+/u, '')
    .replace(/^מה חדש:\s*/i, '')
    .replace(/^כדאי לדעת:\s*/i, '')
    .replace(/^התפתחות מרכזית:\s*/i, '')
    .replace(/^תמונת מצב:\s*/i, '')
    .replace(/^עדכון מועדון:\s*/i, '')
    .replace(/^משחק\/לו"ז:\s*/i, '')
    .replace(/\|\s*נחשף ב-ynet\s*$/iu, '')
    .replace(/^הוא נשאר[:\s-]*/u, '')
    .replace(/\s+/g, ' '));
}

function isWeakCandidate(topicKey, item) {
  const title = cleanTitle(item.title || '');
  const hay = `${title} ${item.sourceUrl || ''}`.toLowerCase();
  if (looksGenericHeadline(title, item.sourceUrl)) return true;
  if (title.length < 22) return true;
  if (/^\$?\s*\d+[\d,.:\s%]+$/.test(title)) return true;
  if (/^\d+(?:\s+to\s+\d+)?\s+percent\b/i.test(title)) return true;
  if (/continue reading|share this story|read more|search \/|loading video|livestream|live stream|join our livestream/.test(hay)) return true;
  if (topicKey === 'crypto' && /price\/(bitcoin|ethereum|xrp)|\bbitcoin \$|\bethereum \$|\bxrp \$|search-filings|public dissemination service|variable insurance|policy & regulation|news-explorer|\/resources\/|largest publicly traded|publicly traded ethereum treasury firms|biggest crypto cases dumped|unicoin foundation|startale expands|press-release|sponsored-content|documentation and governance|safe passage through hormuz/i.test(hay)) return true;
  if (topicKey === 'technology' && /google ads & commerce blog|google deepmind|podcast scale up nation|scale up nation|podcast|livestream|join our livestream/i.test(hay)) return true;
  if (topicKey === 'technology' && /molotov cocktail at his house|usaid whistleblower/i.test(hay)) return true;
  if (topicKey === 'hapoel' && /מכירת מנוי|מנויים|כרטיסים|מתווה הכרטיסים/i.test(hay)) return true;
  return false;
}

const parsers = {
  techcrunch(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/techcrunch\.com\/20\d\d\//i.test(url)) return null;
      if (title.length < 25 || title.length > 180) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 40);
  },
  verge(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/theverge\.com\//i.test(url)) return null;
      if (/\/video\/|\/videos\//i.test(url)) return null;
      if (!/theverge\.com\/(tech|ai-artificial-intelligence|news|policy|gadgets|transportation|report)\//i.test(url)) return null;
      if (url === 'https://www.theverge.com/') return null;
      if (title.length < 25 || title.length > 180) return null;
      if (/^(read more|continue reading|share this story|the homepage the verge the verge logo\.?|the verge the verge logo\.?)$/i.test(title)) return null;
      if (/^(alongside other announcements last week|said the “idea” isn’t dead|rolling out its ai auto browse|70 to 90 percent of its code)$/i.test(title)) return null;
      if (/^[a-z].*house$/i.test(title) && title.length < 45) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 40);
  },
  reuters(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/reuters\.com\/(world|technology|business|markets|legal)\//i.test(url)) return null;
      if (/\/video\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 80);
  },
  ars(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/arstechnica\.com\/(gadgets|ai|tech-policy|science|information-technology)\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 80);
  },
  wired(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/wired\.com\/story\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 80);
  },
  googleblog(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/blog\.google\//i.test(url)) return null;
      if (title.length < 25 || title.length > 180) return null;
      if (looksGenericHeadline(title, url)) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 40);
  },
  calcalist(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/calcalist\.co\.il\//i.test(url)) return null;
      if (/smbc|conference|marketmoney|podcast|scale up nation|\bמוסף כלכליסט\b/i.test(url + ' ' + title)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) || `${TODAY}T00:00:00` };
    }, 80);
  },
  telegram(html, source) {
    const texts = [...html.matchAll(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi)];
    const dates = [...html.matchAll(/<a[^>]+class="tgme_widget_message_date"[^>]+href="([^"]+)"/gi)];
    const out = [];
    for (let i = 0; i < Math.min(texts.length, dates.length) && out.length < 20; i += 1) {
      const title = stripTags(texts[i][1]).slice(0, 220);
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
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) || `${TODAY}T00:00:00` };
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
      if (/podcast|newsletter|daily edition|\/blogs\//i.test(`${url} ${title}`)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  kan(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/kan\.org\.il\/content\/kan-news\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) || `${TODAY}T00:00:00` };
    }, 120);
  },
  coindesk(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/coindesk\.com\//i.test(url)) return null;
      if (looksGenericHeadline(title, url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  decrypt(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/decrypt\.co\//i.test(url)) return null;
      if (/news-explorer|price|\/videos?\/|\/learn\/|\/research\//i.test(url)) return null;
      if (/biggest bitcoin portfolios|long reads|deep dives/i.test(url + ' ' + title)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url) };
    }, 80);
  },
  theblock(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/theblock\.co\/post\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 80);
  },
  dlnews(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/dlnews\.com\/articles\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 80);
  },
  blockworks(html, source) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/blockworks\.co\/news\//i.test(url)) return null;
      if (title.length < 25 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) };
    }, 80);
  },
  sec(html) {
    return extract(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize('https://www.sec.gov/news/pressreleases', m[1]);
      const title = stripTags(m[2]);
      if (!/sec\.gov\//i.test(url)) return null;
      if (!/\/news\/press-release\//i.test(url)) return null;
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
      if (!/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה/i.test(title)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 60);
  },
  wallasport(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/sports\.walla\.co\.il\/item\//i.test(url)) return null;
      if (!/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה/i.test(title)) return null;
      if (/הפועל חיפה|הפועל ירושלים|מכבי|בית"ר/i.test(title) && !/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה/i.test(title)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: TODAY };
    }, 80);
  },
  onesport(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/one\.co\.il\/Article\//i.test(url)) return null;
      if (!/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה/i.test(title)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) || TODAY };
    }, 80);
  },
  sport5(html, source) {
    return extract(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi, html, (m) => {
      const url = absolutize(source.url, m[1]);
      const title = stripTags(m[2]);
      if (!/sport5\.co\.il\/articles\.aspx/i.test(url)) return null;
      if (!/הפועל פ"ת|הפועל פתח תקווה|הפועל פתח תקוה/i.test(title)) return null;
      if (title.length < 20 || title.length > 220) return null;
      return { title, url, publishedAt: inferPublishedAt(title, url, m[0], html) || TODAY };
    }, 80);
  },
  soccerwayhapoel(html, source) {
    const pageText = stripTags(html);
    const out = [];
    if (/hapoel petah|petah tiqwa|petah tikva/i.test(pageText) && /fixture|fixtures|match|matches|results/i.test(pageText)) {
      out.push({
        title: 'Hapoel Petah Tikva fixture and results page verified',
        url: source.url,
        publishedAt: TODAY,
        fixture: true
      });
    }
    return out;
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
  const rawValue = String(item.publishedAt || '').trim();
  const publishedValue = normalizePublishedAt(rawValue);
  const published = new Date(publishedValue);
  const windowStart = new Date(WINDOW_START_ISO);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const publishedDay = rawValue;
    const windowDay = WINDOW_START_ISO.slice(0, 10);
    return publishedDay === TODAY || publishedDay === windowDay;
  }
  if (!Number.isNaN(published.getTime()) && !Number.isNaN(windowStart.getTime())) {
    return published.getTime() >= windowStart.getTime();
  }
  return publishedValue.slice(0, 10) === TODAY;
}

function makeSummary(topicKey, item) {
  return smartTrim(cleanTitle(item.title), topicKey === 'crypto' ? 150 : 170);
}

function makeWhy() {
  return 'למה זה חשוב';
}

function buildArticlePreview(item) {
  const chunks = [];
  if (item.articleDescription) chunks.push(item.articleDescription);
  if (Array.isArray(item.articleParagraphs)) {
    for (const paragraph of item.articleParagraphs.slice(0, 3)) chunks.push(paragraph);
  }
  const unique = chunks
    .map(text => cleanArticleText(text))
    .filter(Boolean)
    .filter((text, index, arr) => arr.findIndex(x => x === text) === index);
  return unique.slice(0, 3).join('\n');
}

function scoreItem(topicKey, item, sourceCount) {
  let score = 0;
  const clean = cleanTitle(item.title || '');
  const t = `${clean} ${item.sourceUrl}`.toLowerCase();
  const published = normalizePublishedAt(item.publishedAt || '');
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(published).getTime()) / (24 * 60 * 60 * 1000)));

  if (item.fixture) score += 14;
  if (item.fallbackMode === 'weekly') score -= 4;
  score += item.sourceKind === 'primary' ? 8 : 5;
  score += item.fresh ? 10 : -10;
  score -= Math.min(ageDays * 3, 18);
  score += item.verificationCount >= 2 ? 5 : 0;
  score += item.signalPositive ? 4 : 0;
  score -= item.signalNegative ? 12 : 0;
  score -= Math.max(0, sourceCount - 2);
  if (looksGenericHeadline(clean, item.sourceUrl)) score -= 18;
  if (/\.$/.test(clean)) score -= 2;

  if (topicKey === 'technology' || topicKey === 'technology2') {
    if (/openai|anthropic|google|gemini|claude|agent|api|tool|startup|funding|launch|release|codex|automation|chip|semiconductor|deepmind|cybersecurity|robot|workspace|chrome/i.test(t)) score += 8;
    if (/pricing|ads|marketplace|funding|revenue/.test(t)) score += 2;
    if (/openai|anthropic|google|meta|microsoft|amazon|apple/i.test(t)) score += 2;
  }
  if (topicKey === 'crypto') {
    if (/bitcoin|btc|ethereum|eth|xrp|etf|sec|token|market|exchange|regulation/i.test(t)) score += 9;
    if (/profit|surge|breakout|adoption|institutional|approval|liquidation|selloff/.test(t)) score += 4;
    if (/price\//.test(t)) score -= 12;
  }
  if (topicKey === 'israel') {
    if (/איראן|עזה|לבנון|חיזבאללה|כנסת|ממשלה|ביטחון|צה"ל|מלחמה|קבינט|חטופים|טראמפ/.test(clean)) score += 8;
  }
  if (topicKey === 'hapoel') {
    if (/הפועל פ"ת|הפועל פתח תקווה|עומר פרץ|פלייאוף|מחזור|מאמן|סגל|משחק/.test(clean)) score += 8;
    if (/הפועל חיפה|הפועל ירושלים|מכבי|בית"ר/.test(clean) && !/הפועל פ"ת|הפועל פתח תקווה/.test(clean)) score -= 8;
  }
  return score;
}

function canonicalDedupKey(item = {}) {
  const topic = String(item.category || '');
  const title = cleanTitle(item.title || item.summary || '');
  const source = String(item.source || '').toLowerCase();
  let softTitle = title.toLowerCase();
  softTitle = softTitle
    .replace(/\|\s*נחשף ב-ynet/iu, '')
    .replace(/^הוא נשאר[:\s-]*/u, '')
    .replace(/^עכשיו זה רשמי[:\s-]*/u, '')
    .replace(/חוזהו/g, 'חוזה')
    .replace(/האריך את/g, 'האריך')
    .replace(/בהפועל\s*פ(?:"|׳|')?ת/gu, 'הפועל פתח תקווה')
    .replace(/gpt\s*[-.]?\s*5\.5/gi, 'gpt55')
    .replace(/gpt\s*5\.5/gi, 'gpt55')
    .replace(/claude\s*opus\s*4\.7/gi, 'claudeopus47')
    .replace(/openai/gi, 'openai')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  let softKey = softTitle.split(' ').filter(Boolean).slice(0, 8).join(' ');
  if (topic === 'hapoel' && /עומר פרץ/.test(title) && /האריך/.test(title) && /2028|חוזה/.test(title)) {
    softKey = 'hapoel omer peretz extension';
  }
  if ((topic === 'technology' || topic === 'technology2') && /gpt55/.test(softTitle) && /openai|gpt55/.test(softTitle)) {
    softKey = 'technology openai gpt55';
  }
  if ((topic === 'technology' || topic === 'technology2') && /claudeopus47|opus 4 7/.test(softTitle)) {
    softKey = 'technology claude opus 47';
  }
  return {
    topic,
    source,
    key: title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
    softKey
  };
}

function dedup(items) {
  const seen = new Set();
  const softSeen = new Set();
  const out = [];
  for (const item of items) {
    const { topic, key, softKey } = canonicalDedupKey(item);
    if (!key || seen.has(key)) continue;
    if (softKey && softSeen.has(`${topic}:${softKey}`)) continue;
    seen.add(key);
    if (softKey) softSeen.add(`${topic}:${softKey}`);
    out.push(item);
  }
  return out;
}

function dedupeAcrossPage(results = []) {
  const preferredTopicOrder = ['technology', 'technology2', 'israel', 'crypto', 'hapoel'];
  const topicRank = new Map(preferredTopicOrder.map((topic, index) => [topic, index]));
  const preferredSourcePatterns = [
    { test: /(reuters|ars technica|techcrunch|the verge|google blog|calcalist)/i, rank: 0 },
    { test: /(telegram|technewsheb|ai_tg_il|botai14|hackit770)/i, rank: 1 }
  ];

  const allItems = results.flatMap(result => result.selected || []);
  const groups = new Map();
  for (const item of allItems) {
    const { softKey, key } = canonicalDedupKey(item);
    const groupKey = ((item.category === 'technology' || item.category === 'technology2') && softKey) ? `cross:${softKey}` : `${item.category}:${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(item);
  }

  const keepIds = new Set();
  for (const groupItems of groups.values()) {
    groupItems.sort((a, b) => {
      const aTopicRank = topicRank.get(a.category) ?? 99;
      const bTopicRank = topicRank.get(b.category) ?? 99;
      if (aTopicRank !== bTopicRank) return aTopicRank - bTopicRank;
      const aSourceRank = preferredSourcePatterns.find(x => x.test.test(String(a.source || '')))?.rank ?? 9;
      const bSourceRank = preferredSourcePatterns.find(x => x.test.test(String(b.source || '')))?.rank ?? 9;
      if (aSourceRank !== bSourceRank) return aSourceRank - bSourceRank;
      return Number(b.score || 0) - Number(a.score || 0);
    });
    keepIds.add(groupItems[0].id);
  }

  return results.map(result => ({
    ...result,
    selected: (result.selected || []).filter(item => keepIds.has(item.id)),
    topicStatus: {
      ...result.topicStatus,
      got: (result.selected || []).filter(item => keepIds.has(item.id)).length
    }
  }));
}

const TOPIC_RULES = {
  technology: { targetCount: 5, minGoodCount: 5, maxCount: 5, lowVolumeByDesign: false },
  technology2: { targetCount: 5, minGoodCount: 5, maxCount: null, lowVolumeByDesign: false },
  israel: { targetCount: 5, minGoodCount: 5, maxCount: 5, lowVolumeByDesign: false },
  crypto: { targetCount: 5, minGoodCount: 5, maxCount: 5, lowVolumeByDesign: false },
  hapoel: { targetCount: 5, minGoodCount: 1, maxCount: 5, lowVolumeByDesign: true }
};

function getTopicRule(topicKey) {
  return TOPIC_RULES[topicKey] || { targetCount: 5, minGoodCount: 5, maxCount: 5, lowVolumeByDesign: false };
}

function diversify(items, maxCount = 5) {
  const chosen = [];
  const sourceCaps = new Map();
  const titleCaps = new Set();
  for (const item of items) {
    const current = sourceCaps.get(item.source) || 0;
    const softKey = cleanTitle(item.title).toLowerCase().split(' ').slice(0, 6).join(' ');
    if (current >= 2) continue;
    if (titleCaps.has(softKey)) continue;
    chosen.push(item);
    sourceCaps.set(item.source, current + 1);
    titleCaps.add(softKey);
    if (maxCount && chosen.length === maxCount) break;
  }
  return chosen;
}

async function collectSource(source) {
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
  return [];
}

function buildWeeklyFallbackCandidates(topicKey, pooled) {
  const weekly = pooled.filter(item => {
    const published = item.publishedAt || '';
    return item.signalPositive && !item.signalNegative && (/2026-04-(0[5-9]|10|11)/.test(published) || /\/2026\/04\/(0[5-9]|10|11)\//.test(item.sourceUrl));
  });
  return dedup(weekly).map(item => ({ ...item, fallbackMode: 'weekly' }));
}

async function collectTopic(topic) {
  const topicRule = getTopicRule(topic.key);
  const runs = [];
  for (const source of topic.sources) {
    try {
      runs.push(await collectSource(source));
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
        title: normalizeArticleTitle({ source: run.source }, raw.title),
        source: run.source,
        sourceUrl: raw.url,
        sourceKind: run.kind,
        sourceType: raw.fixture ? 'fixture' : run.kind,
        sourceStrength: run.kind === 'primary' ? 'high' : 'medium',
        publishedAt: normalizePublishedAt(raw.publishedAt),
        fresh: isFresh(raw),
        signalPositive: signals.positive,
        signalNegative: signals.negative,
        verificationCount: 1,
        collectedAt: NOW,
        fixture: Boolean(raw.fixture),
        synthetic: Boolean(raw.synthetic)
      });
    }
  }

  if (topic.key === 'hapoel') {
    pooled.push(...buildHapoelFixtureCandidates());
  }

  for (const item of pooled) {
    item.verificationCount = pooled.filter(other => other !== item && cleanTitle(other.title).toLowerCase() === cleanTitle(item.title).toLowerCase()).length + 1;
  }

  const strongFresh = pooled.filter(item => item.signalPositive && !item.signalNegative && item.fresh && !isWeakCandidate(topic.key, item));
  const freshToday = strongFresh.filter(item => normalizePublishedAt(item.publishedAt).slice(0, 10) === TODAY);
  const broadFresh = pooled.filter(item => item.signalPositive && !item.signalNegative && item.fresh);
  let candidatePool = freshToday.length >= topicRule.targetCount ? freshToday : strongFresh;
  if (topic.key === 'crypto' && candidatePool.length < topicRule.targetCount) {
    const recentWindow = pooled.filter(item => {
      const published = normalizePublishedAt(item.publishedAt || '');
      const ageDays = Math.max(0, Math.floor((Date.now() - new Date(published).getTime()) / (24 * 60 * 60 * 1000)));
      return ageDays <= 3;
    });
    candidatePool = [...candidatePool, ...recentWindow.filter(item => !isWeakCandidate(topic.key, item))];
  }
  if (topic.key === 'crypto' && candidatePool.length < topicRule.targetCount) {
    candidatePool = [...candidatePool, ...buildWeeklyFallbackCandidates(topic.key, pooled).filter(item => !isWeakCandidate(topic.key, item))];
  }
  if (topic.key === 'crypto' && candidatePool.length < topicRule.targetCount) {
    candidatePool = [...candidatePool, ...broadFresh.filter(item => /coindesk|the block|dl news/i.test(item.source.toLowerCase()) && !isWeakCandidate(topic.key, item))];
  }
  if (candidatePool.length < topicRule.targetCount) {
    candidatePool = [...candidatePool, ...pooled.filter(item => item.signalPositive && !item.signalNegative && item.fresh && !isWeakCandidate(topic.key, item))];
  }

  const perSourceLimited = [];
  const sourceTake = new Map();
  for (const item of dedup(candidatePool)) {
    const current = sourceTake.get(item.source) || 0;
    if (current >= 6) continue;
    perSourceLimited.push(item);
    sourceTake.set(item.source, current + 1);
  }

  const bySource = Object.fromEntries(runs.map(run => [run.source, perSourceLimited.filter(item => item.source === run.source).length]));
  const scored = perSourceLimited.map(item => {
    let certainty = 'נמוכה';
    if (item.verificationCount >= 3) certainty = 'מאומת היטב';
    else if (item.verificationCount === 2) certainty = 'מאומת חלקית';
    else if (item.sourceKind === 'primary') certainty = 'מאומת חלקית';
    return {
      ...item,
      summary: makeSummary(topic.key, item),
      why: makeWhy(topic.key, item),
      certainty,
      score: scoreItem(topic.key, item, bySource[item.source] || 1),
      publishedLabel: formatHebrewDateTime(item.publishedAt)
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = new Date(normalizePublishedAt(a.publishedAt)).getTime();
    const bTime = new Date(normalizePublishedAt(b.publishedAt)).getTime();
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && bTime !== aTime) return bTime - aTime;
    return 0;
  });

  let selected;
  const editorResult = applyEditorSelection(topic.key, scored);
  if (topic.key === 'technology2') {
    selected = dedup(editorResult.ok && Array.isArray(editorResult.selected) && editorResult.selected.length > 0 ? editorResult.selected : scored);
  } else {
    selected = diversify(scored, topicRule.maxCount || topicRule.targetCount);
    if (editorResult.ok && Array.isArray(editorResult.selected) && editorResult.selected.length > 0) {
      selected = editorResult.selected.slice(0, topicRule.maxCount || topicRule.targetCount);
    } else if (selected.length < topicRule.targetCount) {
      const missing = scored.filter(item => !selected.some(chosen => chosen.id === item.id)).slice(0, topicRule.targetCount - selected.length);
      selected = [...selected, ...missing];
    }
  }

  selected = await Promise.all(selected.map(async item => {
    const articleDetails = await fetchArticleDetails(item);
    return {
      ...item,
      ...articleDetails,
      title: articleDetails.normalizedTitle || item.title,
      summary: makeSummary(topic.key, { ...item, title: articleDetails.normalizedTitle || item.title }),
      articlePreview: buildArticlePreview({ ...item, ...articleDetails })
    };
  }));

  selected = selected.filter(item => {
    const hay = `${item.title || ''} ${item.articleDescription || ''} ${item.articleBody || ''} ${item.sourceUrl || ''}`.toLowerCase();
    if (topic.key === 'technology' && /podcast scale up nation|scale up nation בהנחיית|scale up nation|פודקאסט scale up nation/.test(hay)) return false;
    if (topic.key === 'technology' && /the homepage the verge|the verge logo|alongside other announcements last week|said the “idea” isn’t dead|rolling out its ai auto browse|70 to 90 percent of its code/.test(hay)) return false;
    if (topic.key === 'technology' && item.source === 'WIRED' && /menu security politics|wired insider|livestreams merch search search/.test(hay)) return false;
    return true;
  });

  selected = await enrichSelectedMedia(selected);

  const rerunEditorResult = applyEditorSelection(topic.key, selected);
  if (topic.key === 'technology2') {
    if (rerunEditorResult.ok && Array.isArray(rerunEditorResult.selected) && rerunEditorResult.selected.length > 0) {
      const selectedIds = new Set(rerunEditorResult.selected.map(item => item.id));
      const extra = selected.filter(item => !selectedIds.has(item.id));
      selected = dedup([...rerunEditorResult.selected, ...extra]);
    }
  } else if (rerunEditorResult.ok && Array.isArray(rerunEditorResult.selected) && rerunEditorResult.selected.length > 0) {
    selected = rerunEditorResult.selected.slice(0, topicRule.maxCount || topicRule.targetCount);
  }

  const effectiveMinimum = topicRule.lowVolumeByDesign ? topicRule.minGoodCount : topicRule.targetCount;
  const topicStatus = {
    topic: topic.key,
    label: topic.hebrew,
    wanted: topicRule.targetCount,
    minGoodCount: effectiveMinimum,
    got: selected.length,
    maxCount: topicRule.maxCount,
    lowVolumeByDesign: topicRule.lowVolumeByDesign,
    fallbackActive: selected.length < effectiveMinimum,
    sourcesWorked: runs.filter(r => r.success).map(r => r.source),
    sourcesFailed: runs.filter(r => !r.success).map(r => ({ source: r.source, error: r.error || 'no_items' })),
    editorApplied: Boolean(editorResult.ok),
    editorError: editorResult.ok ? null : (editorResult.error || null)
  };

  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.raw.json`), JSON.stringify(runs, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.normalized.json`), JSON.stringify(pooled, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.deduped.json`), JSON.stringify(scored, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, `${topic.key}-live.selected.json`), JSON.stringify(selected, null, 2), 'utf8');

  return { selected, topicStatus };
}

// (keep everything up to the end of scoreItem function)


async function main() {
  const results = [];
  for (const topic of TOPICS) results.push(await collectTopic(topic));

  const dedupedResults = dedupeAcrossPage(results);
  const items = dedupedResults.flatMap(r => r.selected);
  const meta = {
    lastUpdated: NOW,
    sourcesWorkedCount: new Set(dedupedResults.flatMap(r => r.topicStatus.sourcesWorked)).size,
    fallbackActive: dedupedResults.some(r => r.topicStatus.fallbackActive),
    status: dedupedResults.every(r => r.topicStatus.got >= (r.topicStatus.minGoodCount || r.topicStatus.wanted)) ? 'SUCCESS' : 'PARTIAL',
    topics: dedupedResults.map(r => r.topicStatus)
  };

  fs.writeFileSync(FINAL_PATH, JSON.stringify(items, null, 2), 'utf8');

  const state = {
    lastPublishedAt: NOW,
    buildId: BUILD_ID,
    status: meta.status,
    latestUrl: `./news-dashboard/live-site/latest.html?v=${BUILD_ID}`,
    publicLatestUrl: `${PUBLIC_LATEST_URL}?v=${BUILD_ID}`,
    publicUrl: `${PUBLIC_URL}?v=${BUILD_ID}`,
    topics: Object.fromEntries(dedupedResults.map(r => [r.topicStatus.topic, r.topicStatus]))
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

  const summary = {
    generatedAt: NOW,
    buildId: BUILD_ID,
    status: meta.status,
    latestUrl: state.latestUrl,
    publicLatestUrl: state.publicLatestUrl,
    publicUrl: state.publicUrl,
    lastPublishedAt: NOW,
    sourcesWorkedCount: meta.sourcesWorkedCount,
    fallbackActive: meta.fallbackActive,
    topicStatus: meta.topics
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), 'utf8');

  const telegramLines = ['בוקר טוב', `${PUBLIC_URL}?v=${BUILD_ID}`];
  fs.writeFileSync(TELEGRAM_SUMMARY_PATH, telegramLines.join('\n'), 'utf8');
  fs.writeFileSync(TELEGRAM_ALERT_PATH, '', 'utf8');

  console.log(JSON.stringify({ status: meta.status, items: items.length }, null, 2));
}

module.exports = { main };

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

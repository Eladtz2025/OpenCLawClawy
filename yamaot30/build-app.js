#!/usr/bin/env node
// Builds yamaot30-study.html from:
//   - questions.json   (parsed from israelsails.com question bank)
//   - sign.pdf         (embedded as base64 for in-app reference)
//   - explanations.js  (hand-authored detailed explanations)
//
// Output: a single self-contained HTML file. No build tools, no CDN deps.

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SRC_DIR = 'C:/Users/Itzhak/AppData/Local/Temp/yamaot30';

const questions = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'questions.json'), 'utf8'));
const pdfB64 = fs.readFileSync(path.join(SRC_DIR, 'pdf-base64.txt'), 'utf8').trim();

// Hand-authored detailed explanations for the user-specified images.
// `verified: true` only on the three the user explicitly described.
// Everything else stays unverified ("דורש בדיקה ידנית") until reviewed.
const seedExplanations = {
  22: {
    verified: true,
    official: 'כלי שייט בעל הספק מעל 50 מטרים, מוגבל בכושרו לתמרן, פונה שמאלה.',
    whatWeSee: 'אנכית: אדום — לבן — אדום (מוגבל לתמרן). שני אורות תורן לבנים אנכיים (אורך מעל 50 מ\\\'). אור צד אדום בלבד.',
    breakdown: [
      'שלשה אנכית אדום-לבן-אדום = "מוגבל בכושרו לתמרן" (RAM, Restricted in Ability to Maneuver).',
      'שני אורות לבנים אנכיים על התרנים = כלי הספק באורך **מעל 50 מטרים** (השני קדמי-נמוך, האחורי גבוה יותר).',
      'אור צד אדום משמאל = רואים את **הצד השמאלי (Port)** של כלי השייט.',
      'אין אור צד ירוק נראה = לא צופים מולו ישירות; כיוון ההפלגה הוא בעיקר משמאל לימין שלנו.'
    ],
    direction: 'משמאל לימין (כלי השייט פונה שמאלה ביחס אלינו).',
    conclusion: 'כלי הספק > 50 מ\\\' מוגבל בכושרו לתמרן, עושה דרכו במים, רואים אותו מצד שמאל (Port).',
    commonMistake: 'בלבול עם "אינו שולט" (NUC) שמראה רק שני אדומים אנכיים — כאן יש שלושה (אדום-לבן-אדום), כלומר RAM ולא NUC.',
    memoryTrick: '"אדום–לבן–אדום" → R-W-R → **R**estricted, **W**orking, **R**estricted: מוגבל לתמרן אבל עדיין עושה דרכו.'
  },
  25: {
    verified: true,
    official: 'כלי שייט בעל הספק מעל 50 מטרים, מוגבל מחמת שוקע, פונה ימינה.',
    whatWeSee: 'אנכית: שלושה אורות אדומים (Constrained by Draught). שני אורות תורן לבנים אנכיים (אורך > 50 מ\\\'). אור צד ירוק.',
    breakdown: [
      'שלושה אדומים אנכיים = "מוגבל מחמת שוקע" (CBD, Constrained By Draught) — כלי שייט שאינו יכול לסטות מנתיבו בגלל עומק מים.',
      'שני אורות לבנים אנכיים על התרנים = כלי הספק > 50 מ\\\'.',
      'אור צד ירוק = רואים את **הצד הימני (Starboard)** שלו.',
      'אין אור צד אדום = לא צופים מולו ישירות; הכיוון בעיקר מימין לשמאל שלנו.'
    ],
    direction: 'מימין לשמאל (כלי השייט פונה ימינה ביחס אלינו).',
    conclusion: 'כלי הספק > 50 מ\\\' מוגבל מחמת שוקע, עושה דרכו, נראה מצד הימני (Starboard).',
    commonMistake: 'אסור לבלבל עם RAM (אדום-לבן-אדום של תמונה 22). שלושה אדומים רצופים = CBD בלבד.',
    memoryTrick: '"שלושה אדומים" → "שלושה לאות שוקע מוגבל" (3R = Restricted by 3 Reds = CBD).'
  },
  66: {
    verified: true,
    official: 'כלי שייט שאינו שולט (Not Under Command), עושה דרכו, נראה מהחרטום.',
    whatWeSee: 'שני אורות אדומים אנכיים. אורות צד אדום וירוק (שניהם נראים) — כלומר רואים אותו ישירות מלפנים.',
    breakdown: [
      'שני אדומים אנכיים = "אינו שולט" (NUC, Not Under Command) — כלי שאינו יכול לתמרן עקב נסיבות יוצאות דופן (תקלה, סופה, וכד\\\').',
      'אורות צד **גם** אדום (פורט) **וגם** ירוק (סטרבורד) = רואים אותו מלפנים, ישירות בחזית.',
      'אין הפרדה אופקית של אורות הצד = החרטום פונה אלינו.',
      'NUC עם אורות צד = עושה דרכו במים. NUC ללא אורות צד = NUC עוגן/לא עושה דרכו.'
    ],
    direction: 'חרטום אלינו — כלי השייט מתקדם בקירוב לכיווננו.',
    conclusion: 'כלי שייט שאינו שולט, עושה דרכו, נראה מהחרטום (יש סכנת התנגשות פוטנציאלית — נוטים להתרחק).',
    commonMistake: 'בלבול עם RAM (אדום-לבן-אדום) — NUC הוא רק שני אדומים אנכיים, ללא לבן באמצע.',
    memoryTrick: '"שני אדומים = שני סטופים" — הכלי "עצור" מתפקודית (NUC), לא יכול לתמרן.'
  }
};

// Detect category by simple keyword heuristic. The site doesn't expose
// categories explicitly. Users can re-categorize via import.
function categorize(q) {
  const t = q.text + ' ' + q.answers.map(a => a.text).join(' ');
  if (q.images && q.images.length) return 'אורות וסימונים';
  if (/חוק|תקנה|תקנון|עקרון|קולרגס|cוolregs/i.test(t)) return 'חוק והתקנון';
  if (/מפרשית|מפרש|רוח/.test(t)) return 'הפלגת מפרשיות';
  if (/חירום|תאונה|פציעה|חילוץ|כיבוי|אש|הצלה/.test(t)) return 'חירום ובטיחות';
  if (/ניווט|מצפן|GPS|מפה|כיוון|קורס|מהירות|קשר רדיו|VHF|רדיו/.test(t)) return 'ניווט וקשר';
  if (/מזג אוויר|רוח|גלים|סער|טמפרטורה|לחץ ברומטרי|ברומטר/.test(t)) return 'מזג אוויר';
  if (/דלק|מנוע|הילוך|ברגים/.test(t)) return 'מערכות אוניה';
  return 'תאוריה כללית';
}
for (const q of questions) q.category = categorize(q);

// Compact stringify (no whitespace) to keep the embedded payload small.
const dataPayload = JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'israelsails.com / yamaot30 (parsed; license = community mirror)',
  questions,
  seedExplanations
});

const html = `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1b2a">
<title>ימאות 30 — אפליקציית לימוד</title>
<style>
:root {
  --bg: #0d1b2a;
  --bg-soft: #1b263b;
  --bg-card: #1f2a3d;
  --bg-input: #243049;
  --text: #e0e1dd;
  --text-dim: #b8b8c0;
  --muted: #8d99b3;
  --accent: #4cc9f0;
  --accent-dim: #3098bf;
  --good: #76c893;
  --bad: #ef476f;
  --warn: #ffd166;
  --line: #344563;
  --radius: 10px;
  --gap: 14px;
  --pad: 14px;
  --font: -apple-system, "Segoe UI", "Helvetica Neue", "Arial Hebrew", "David", Arial, sans-serif;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { height: 100%; margin: 0; }
body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
  line-height: 1.55;
  overflow-x: hidden;
}

/* desktop layout: 4 columns RTL → reading order right→left */
.app {
  display: grid;
  grid-template-columns: 280px 1fr 1fr 360px;
  gap: var(--gap);
  padding: var(--gap);
  min-height: 100vh;
}
.col { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
.card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: var(--pad);
  border: 1px solid var(--line);
}
.card h2 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent);
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
}
button, .btn {
  background: var(--bg-input);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 9px 12px;
  border-radius: 7px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  text-align: center;
  transition: background .12s, border-color .12s, transform .05s;
}
button:hover, .btn:hover { background: #2a3756; border-color: var(--accent-dim); }
button:active { transform: scale(.98); }
button.primary { background: var(--accent-dim); border-color: var(--accent); color: #061320; font-weight: 600; }
button.primary:hover { background: var(--accent); }
button.danger { color: var(--bad); border-color: var(--bad); }
button.subtle { background: transparent; }
.btn-row { display: flex; flex-wrap: wrap; gap: 8px; }
.btn-row > * { flex: 1 1 auto; }

/* dashboard */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat {
  background: var(--bg-input);
  border-radius: 7px;
  padding: 9px 10px;
  text-align: center;
}
.stat .num { font-size: 22px; font-weight: 700; color: var(--accent); }
.stat .lbl { font-size: 11px; color: var(--text-dim); }
.nav-list { display: flex; flex-direction: column; gap: 6px; }
.nav-list button { text-align: right; padding: 10px 12px; }
.nav-list button.active { background: var(--accent-dim); color: #061320; border-color: var(--accent); }

/* question card */
.q-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.q-text { font-size: 17px; line-height: 1.7; margin: 6px 0 14px; }
.answers { display: flex; flex-direction: column; gap: 8px; }
.answer {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--bg-input);
  border: 2px solid var(--line);
  border-radius: 9px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 15px;
  text-align: right;
  transition: border-color .15s, background .15s;
}
.answer:hover:not(.locked) { border-color: var(--accent-dim); }
.answer .letter {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #344563;
  color: var(--text);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600;
  font-size: 14px;
}
.answer.correct { border-color: var(--good); background: rgba(118,200,147,0.12); }
.answer.correct .letter { background: var(--good); color: #0d1b2a; }
.answer.wrong { border-color: var(--bad); background: rgba(239,71,111,0.12); }
.answer.wrong .letter { background: var(--bad); color: #fff; }
.answer.reveal { border-color: var(--good); }
.answer.reveal .letter { background: var(--good); color: #0d1b2a; }
.answer.locked { cursor: default; }

.action-row { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; }
.action-row button { flex: 0 0 auto; }
.note-area {
  margin-top: 14px;
}
.note-area textarea {
  width: 100%;
  min-height: 56px;
  resize: vertical;
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 8px 10px;
  font: inherit;
  font-size: 14px;
}
.feedback {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 7px;
  font-size: 14px;
}
.feedback.good { background: rgba(118,200,147,0.18); border-right: 3px solid var(--good); }
.feedback.bad { background: rgba(239,71,111,0.18); border-right: 3px solid var(--bad); }
.feedback.guess { background: rgba(255,209,102,0.18); border-right: 3px solid var(--warn); }
.hint-box {
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(76,201,240,0.10);
  border-right: 3px solid var(--accent);
  border-radius: 7px;
  font-size: 14px;
}
.hint-box h3 { margin: 0 0 6px; font-size: 13px; color: var(--accent); }

/* image panel */
.image-tabs {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;
}
.image-tabs button { padding: 5px 10px; font-size: 13px; flex: 0 0 auto; }
.image-tabs button.active { background: var(--accent-dim); color: #061320; border-color: var(--accent); }
.image-zoom {
  display: flex; gap: 6px; align-items: center; margin-bottom: 8px;
  font-size: 12px; color: var(--muted);
}
.image-zoom button { padding: 4px 8px; font-size: 13px; }
.image-frame {
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  flex: 1 1 auto;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.image-frame img { max-width: 100%; max-height: 100%; display: block; }
.image-frame embed, .image-frame iframe {
  width: 100%; height: 100%; min-height: 280px; border: none; background: #fff;
}
.image-empty {
  color: var(--muted);
  text-align: center;
  padding: 30px 20px;
  font-size: 14px;
}
.image-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.image-actions button { font-size: 12px; padding: 5px 9px; }
.image-clean { background: #fff !important; }
.image-clean img { mix-blend-mode: normal; }

/* explanation panel */
.exp-section { margin-top: 12px; }
.exp-section h3 {
  font-size: 13px;
  margin: 0 0 4px;
  color: var(--accent);
  font-weight: 600;
}
.exp-section p, .exp-section ul, .exp-section ol {
  margin: 4px 0;
  font-size: 14px;
  line-height: 1.55;
}
.exp-section ul, .exp-section ol { padding-right: 20px; }
.exp-section li { margin-bottom: 3px; }
.exp-empty { color: var(--muted); font-size: 14px; padding: 20px 6px; text-align: center; }
.unverified-tag {
  display: inline-block;
  background: rgba(255,209,102,0.18);
  color: var(--warn);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  margin-right: 6px;
}

/* modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  display: none;
  align-items: center; justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal-overlay.show { display: flex; }
.modal {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 20px;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
}
.modal h2 { margin-top: 0; font-size: 17px; color: var(--accent); }
.modal textarea { width: 100%; min-height: 90px; }
.modal input[type="text"], .modal input[type="number"], .modal input[type="file"] {
  width: 100%; padding: 8px 10px;
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 6px;
  font: inherit;
  margin: 4px 0 10px;
}
.modal-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }

/* search list */
.search-list { max-height: 60vh; overflow: auto; margin-top: 10px; }
.search-item {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  font-size: 14px;
}
.search-item:hover { background: var(--bg-input); }
.search-item .qnum { color: var(--accent); font-weight: 600; margin-left: 6px; }
.search-item .qcat { font-size: 11px; color: var(--muted); float: left; }

/* exam summary */
.exam-bar { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
.exam-progress {
  width: 100%; height: 6px; background: var(--bg-input);
  border-radius: 3px; overflow: hidden; margin-bottom: 12px;
}
.exam-progress > div { height: 100%; background: var(--accent); transition: width .25s; }

/* mobile: stack panels */
@media (max-width: 1100px) {
  .app { grid-template-columns: 1fr; padding: 10px; gap: 10px; }
  .col-dash { order: 4; }
  .col-q { order: 1; }
  .col-img { order: 2; }
  .col-exp { order: 3; }
  .stat-grid { grid-template-columns: repeat(4, 1fr); }
  body { font-size: 16px; }
  .answer { padding: 12px 14px; font-size: 16px; min-height: 48px; }
  .answer .letter { width: 32px; height: 32px; flex-basis: 32px; }
  button, .btn { padding: 11px 14px; font-size: 15px; min-height: 42px; }
  .image-frame { min-height: 220px; }
  .nav-list button { padding: 12px 14px; }
}
@media (max-width: 600px) {
  .stat-grid { grid-template-columns: 1fr 1fr; }
  .image-frame { min-height: 200px; }
}

/* sticky bottom action on mobile */
.mobile-next {
  display: none;
  position: sticky;
  bottom: 0;
  left: 0; right: 0;
  margin-top: 10px;
  z-index: 50;
}
@media (max-width: 1100px) {
  .mobile-next { display: block; }
  .mobile-next button { width: 100%; padding: 14px; font-size: 16px; }
}

/* utility */
.tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-dim);
  margin-left: 6px;
}
.tag.good { color: var(--good); }
.tag.bad  { color: var(--bad); }
.tag.warn { color: var(--warn); }
.help-text { font-size: 12px; color: var(--muted); margin-top: 4px; }
.divider { height: 1px; background: var(--line); margin: 10px 0; }
.toast {
  position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
  background: var(--bg-card); border: 1px solid var(--accent);
  padding: 10px 16px; border-radius: 7px; z-index: 200;
  font-size: 14px; box-shadow: 0 4px 18px rgba(0,0,0,0.4);
}
</style>
</head>
<body>
<div class="app">

  <!-- RIGHT column (dashboard, first in source order = rightmost in RTL) -->
  <aside class="col col-dash">
    <div class="card">
      <h2>סטטוס</h2>
      <div class="stat-grid" id="stats"></div>
      <div class="divider"></div>
      <div class="nav-list" id="modeNav"></div>
    </div>
    <div class="card">
      <h2>גיבוי וסנכרון</h2>
      <div class="btn-row">
        <button id="exportBtn" class="primary">יצא JSON</button>
        <button id="importBtn">יבא JSON</button>
      </div>
      <div class="help-text">
        כל ההתקדמות שמורה מקומית בדפדפן. להעברה בין מחשב/טלפון: יצא ב-JSON,
        העבר לקובץ (ענן/דוא"ל), פתח באפליקציה בצד השני וייבא.
      </div>
      <div class="divider"></div>
      <div class="btn-row">
        <button id="resetBtn" class="danger">איפוס התקדמות</button>
        <button id="aboutBtn" class="subtle">אודות</button>
      </div>
    </div>
  </aside>

  <!-- center column: question -->
  <main class="col col-q">
    <div class="card">
      <h2>שאלה</h2>
      <div class="q-meta">
        <span id="qNum">—</span>
        <span id="qCat" class="tag"></span>
      </div>
      <div class="q-text" id="qText">טוען...</div>
      <div class="answers" id="answers"></div>
      <div id="feedback"></div>
      <div id="hintBox"></div>

      <div class="action-row">
        <button id="hintBtn">רמז בלי תשובה</button>
        <button id="lightsBtn">שיטת אורות</button>
        <button id="guessBtn">סימנתי כניחוש</button>
        <button id="skipBtn" class="subtle">דלג</button>
      </div>

      <div class="note-area">
        <h3 style="font-size:13px;margin:0 0 4px;color:var(--accent);">הערה אישית לשאלה</h3>
        <textarea id="noteText" placeholder="הערות שלך לשאלה הזו..."></textarea>
      </div>

      <div class="mobile-next">
        <button id="nextBtn" class="primary">שאלה הבאה →</button>
      </div>
    </div>
  </main>

  <!-- center-left column: image -->
  <section class="col col-img">
    <div class="card" style="display:flex; flex-direction:column;">
      <h2>תמונה</h2>
      <div id="imageTabs" class="image-tabs"></div>
      <div id="imageZoom" class="image-zoom" hidden>
        <button data-zoom="-1">−</button>
        <span id="zoomLabel">100%</span>
        <button data-zoom="+1">+</button>
        <button id="cleanBtn">תצוגה נקייה</button>
        <button id="uploadCropBtn">העלה גזירה</button>
      </div>
      <div id="imageFrame" class="image-frame">
        <div class="image-empty">לשאלה זו אין תמונה משויכת.</div>
      </div>
    </div>
  </section>

  <!-- left column: explanation -->
  <aside class="col col-exp">
    <div class="card" style="display:flex;flex-direction:column;max-height:90vh;overflow:hidden;">
      <h2>הסבר תמונה</h2>
      <div id="explanationContent" style="overflow:auto;flex:1;">
        <div class="exp-empty">בחר תמונה כדי להציג הסבר מפורט.</div>
      </div>
      <div class="divider"></div>
      <button id="editExplanationBtn" class="subtle" style="font-size:13px;">עריכת/הוספת הסבר</button>
    </div>
  </aside>

</div>

<!-- modals -->
<div id="modalOverlay" class="modal-overlay">
  <div class="modal" id="modalContent"></div>
</div>

<script>
// ================================ data ================================
const DATA = ${dataPayload};
const PDF_DATA_URI = "data:application/pdf;base64,${pdfB64}";
const PDF_LIVE_URL = "https://israelsails.com/attachments/yamaot30/sign.pdf";
const STORAGE_KEY = "yamaot30-state-v1";
const QUESTIONS_BY_ID = Object.fromEntries(DATA.questions.map(q => [q.id, q]));
const ALL_IMAGE_NUMS = [...new Set(DATA.questions.flatMap(q => q.images || []))].sort((a,b) => a - b);

// ================================ state ================================
const DEFAULT_STATE = {
  version: 1,
  questions: {},   // id → { attempts, lastResult, nextReviewAt, intervalDays, markedAsGuess, notes }
  explanations: {},// imageNum → { official, whatWeSee, breakdown, direction, conclusion, commonMistake, memoryTrick, verified }
  customImages: {},// imageNum → "data:image/png;base64,..."
  ui: { mode: 'smart', currentQId: null, currentImg: null, zoom: 100, cleanView: false }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const s = JSON.parse(raw);
    // shallow merge with default to fill in any missing top-level keys after schema bumps
    return Object.assign({}, DEFAULT_STATE, s,
      { ui: Object.assign({}, DEFAULT_STATE.ui, s.ui || {}) });
  } catch { return seedState(); }
}
function seedState() {
  const s = JSON.parse(JSON.stringify(DEFAULT_STATE));
  // Pre-seed the hand-authored explanations the build knows about.
  for (const [k, v] of Object.entries(DATA.seedExplanations)) {
    s.explanations[k] = JSON.parse(JSON.stringify(v));
  }
  return s;
}
let STATE = loadState();
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); }
  catch (e) { showToast('שגיאת שמירה: ' + e.message); }
}

function qState(id) {
  if (!STATE.questions[id]) {
    STATE.questions[id] = {
      attempts: [],
      lastResult: null,        // 'correct' | 'wrong' | 'guessed' | null
      nextReviewAt: null,
      intervalDays: 0,
      markedAsGuess: false,
      notes: ''
    };
  }
  return STATE.questions[id];
}

// ================================ spaced repetition =================
const INTERVAL_LADDER = [1, 3, 7, 14, 30];
function recordAnswer(id, selectedLetter, wasGuess) {
  const q = QUESTIONS_BY_ID[id];
  const correct = (selectedLetter === q.correct);
  const st = qState(id);
  const result = wasGuess ? 'guessed' : (correct ? 'correct' : 'wrong');
  st.attempts.push({ ts: Date.now(), selectedLetter, correct, wasGuess });
  st.lastResult = result;
  st.markedAsGuess = wasGuess && correct ? true : st.markedAsGuess;
  // Schedule next review:
  const today = new Date(); today.setHours(0,0,0,0);
  let nextDays;
  if (result === 'correct') {
    const nextIdx = Math.min(INTERVAL_LADDER.indexOf(st.intervalDays) + 1, INTERVAL_LADDER.length - 1);
    nextDays = INTERVAL_LADDER[Math.max(0, nextIdx)];
  } else if (result === 'wrong') {
    nextDays = 1;
  } else { // guessed (whether right or wrong)
    nextDays = INTERVAL_LADDER[0]; // cap at 1 day — still weak
  }
  st.intervalDays = nextDays;
  const next = new Date(today.getTime() + nextDays * 86400000);
  st.nextReviewAt = next.toISOString().slice(0, 10);
  saveState();
  return result;
}

function isDue(id) {
  const st = STATE.questions[id];
  if (!st || !st.nextReviewAt) return false;
  return st.nextReviewAt <= new Date().toISOString().slice(0, 10);
}
function isUnseen(id) {
  const st = STATE.questions[id];
  return !st || st.attempts.length === 0;
}

// ================================ pickers ============================
const MODES = [
  { id: 'smart',    label: 'סבב חכם',           pick: pickSmart },
  { id: 'mistakes', label: 'טעויות וניחושים',  pick: pickMistakes },
  { id: 'images',   label: 'שאלות עם תמונה',   pick: pickImages },
  { id: 'exam',     label: 'מבחן 50',           pick: startExam },
  { id: 'bank',     label: 'מאגר שאלות',       pick: openBank }
];

function pickSmart() {
  // priority: due → wrong → guessed → unseen → least-recently-seen
  const due = DATA.questions.filter(q => isDue(q.id) && (STATE.questions[q.id]?.lastResult !== 'correct'));
  if (due.length) return due[Math.floor(Math.random() * due.length)].id;
  const wrong = DATA.questions.filter(q => STATE.questions[q.id]?.lastResult === 'wrong');
  if (wrong.length) return wrong[Math.floor(Math.random() * wrong.length)].id;
  const guessed = DATA.questions.filter(q => STATE.questions[q.id]?.markedAsGuess);
  if (guessed.length) return guessed[Math.floor(Math.random() * guessed.length)].id;
  const unseen = DATA.questions.filter(q => isUnseen(q.id));
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)].id;
  // fallback: oldest-attempt
  const sorted = [...DATA.questions].sort((a, b) => {
    const aa = STATE.questions[a.id]?.attempts || [];
    const bb = STATE.questions[b.id]?.attempts || [];
    const at = aa.length ? aa[aa.length - 1].ts : 0;
    const bt = bb.length ? bb[bb.length - 1].ts : 0;
    return at - bt;
  });
  return sorted[0].id;
}
function pickMistakes() {
  const pool = DATA.questions.filter(q => {
    const s = STATE.questions[q.id];
    return s && (s.lastResult === 'wrong' || s.markedAsGuess);
  });
  if (!pool.length) { showToast('אין כרגע טעויות או ניחושים — כל הכבוד! עובר לסבב חכם.'); return pickSmart(); }
  return pool[Math.floor(Math.random() * pool.length)].id;
}
function pickImages() {
  const pool = DATA.questions.filter(q => q.images && q.images.length);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ================================ exam mode ==========================
let examState = null;
function startExam() {
  const pool = [...DATA.questions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  examState = { ids: pool.slice(0, 50).map(q => q.id), idx: 0, scores: [] };
  showQuestion(examState.ids[0]);
  return null; // suppress default flow
}
function examNext(correct) {
  if (!examState) return;
  examState.scores.push(correct);
  examState.idx++;
  if (examState.idx >= examState.ids.length) {
    const total = examState.scores.length;
    const right = examState.scores.filter(x => x).length;
    const pct = Math.round(100 * right / total);
    openModal('סיום מבחן 50', \`
      <p>ציון: <strong>\${right} / \${total}</strong> (\${pct}%)</p>
      <p>\${pct >= 85 ? 'מצוין — קרוב לרמת מבחן.' : (pct >= 70 ? 'טוב, אפשר ללטש.' : 'דרושה עוד עבודה.')}</p>
      <div class="modal-buttons">
        <button class="primary" data-close>סגירה</button>
      </div>
    \`);
    examState = null;
    setMode('smart');
  } else {
    showQuestion(examState.ids[examState.idx]);
  }
}

// ================================ question bank ======================
function openBank() {
  openModal('מאגר שאלות', \`
    <input type="text" id="bankSearch" placeholder="חפש לפי מספר או טקסט..." style="margin-bottom:10px">
    <div class="search-list" id="bankList"></div>
  \`);
  const renderBank = () => {
    const q = (document.getElementById('bankSearch').value || '').trim().toLowerCase();
    const list = document.getElementById('bankList');
    const filtered = DATA.questions.filter(qq => {
      if (!q) return true;
      if (String(qq.id).includes(q)) return true;
      return qq.text.toLowerCase().includes(q);
    }).slice(0, 60);
    list.innerHTML = filtered.map(qq =>
      '<div class="search-item" data-id="' + qq.id + '">' +
        '<span class="qnum">#' + qq.id + '</span>' +
        '<span class="qcat">' + qq.category + '</span>' +
        '<div>' + escapeHtml(qq.text.slice(0, 110)) + (qq.text.length > 110 ? '...' : '') + '</div>' +
      '</div>'
    ).join('') || '<div class="exp-empty">אין תוצאות.</div>';
    list.querySelectorAll('.search-item').forEach(el => {
      el.onclick = () => {
        const id = Number(el.dataset.id);
        closeModal();
        showQuestion(id);
      };
    });
  };
  document.getElementById('bankSearch').addEventListener('input', renderBank);
  renderBank();
  return null;
}

// ================================ rendering ==========================
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function showQuestion(id) {
  if (!QUESTIONS_BY_ID[id]) return;
  STATE.ui.currentQId = id;
  const q = QUESTIONS_BY_ID[id];
  document.getElementById('qNum').textContent = '#' + q.id;
  document.getElementById('qCat').textContent = q.category;
  document.getElementById('qText').textContent = q.text;
  // Answers
  const ans = document.getElementById('answers');
  ans.innerHTML = '';
  for (const a of q.answers) {
    const div = document.createElement('div');
    div.className = 'answer';
    div.dataset.letter = a.letter;
    div.innerHTML = '<div class="letter">' + a.letter + '</div><div>' + escapeHtml(a.text) + '</div>';
    div.onclick = () => onAnswerClick(id, a.letter, div);
    ans.appendChild(div);
  }
  document.getElementById('feedback').innerHTML = '';
  document.getElementById('hintBox').innerHTML = '';
  document.getElementById('noteText').value = qState(id).notes || '';
  // Images: pick first or current
  const imgs = q.images || [];
  if (imgs.length) {
    STATE.ui.currentImg = imgs.includes(STATE.ui.currentImg) ? STATE.ui.currentImg : imgs[0];
  } else {
    STATE.ui.currentImg = null;
  }
  renderImagePanel(q);
  renderExplanationPanel();
  renderStats();
  saveState();
}

function onAnswerClick(id, letter, el) {
  // Already answered? ignore additional clicks
  if (document.querySelector('.answer.locked')) return;
  const wasGuess = !!document.body.dataset.pendingGuess;
  document.body.dataset.pendingGuess = '';
  const result = recordAnswer(id, letter, wasGuess);
  // Lock all
  document.querySelectorAll('.answer').forEach(a => {
    a.classList.add('locked');
    if (a.dataset.letter === QUESTIONS_BY_ID[id].correct) a.classList.add('reveal');
    if (a === el && letter !== QUESTIONS_BY_ID[id].correct) a.classList.add('wrong');
    if (a === el && letter === QUESTIONS_BY_ID[id].correct) a.classList.add('correct');
  });
  // Feedback
  const fb = document.getElementById('feedback');
  if (result === 'correct') fb.innerHTML = '<div class="feedback good">✓ נכון!</div>';
  else if (result === 'wrong') fb.innerHTML = '<div class="feedback bad">✗ לא נכון. התשובה: ' + QUESTIONS_BY_ID[id].correct + '</div>';
  else fb.innerHTML = '<div class="feedback guess">' + (letter === QUESTIONS_BY_ID[id].correct ? '✓ נכון, אבל סומן כניחוש — ייסקר שוב.' : '✗ ניחוש לא הצליח.') + '</div>';
  renderStats();
  if (examState) {
    setTimeout(() => examNext(letter === QUESTIONS_BY_ID[id].correct), 900);
  }
}

function showHint() {
  const id = STATE.ui.currentQId;
  if (!id) return;
  const q = QUESTIONS_BY_ID[id];
  // Hint without giving the answer: surface category, image hint, common decoy words.
  const lines = [];
  lines.push('קטגוריה: ' + q.category + '.');
  if (q.images && q.images.length) lines.push('יש להסתכל על תמונה ' + q.images.join(', ') + ' בפאנל התמונה.');
  if (q.text.includes('לא')) lines.push('שים לב — השאלה מכילה את המילה "לא". בדוק היטב את הטיית השלילה.');
  if (q.text.includes('כל')) lines.push('שים לב למילה "כל" — לפעמים תשובה "כל התשובות נכונות" היא הפח.');
  if (q.text.match(/(שמאל|ימין)/)) lines.push('כיווני שמאל/ימין — חשוב על הצד שאתה רואה (port=שמאל=אדום, starboard=ימין=ירוק).');
  document.getElementById('hintBox').innerHTML = '<div class="hint-box"><h3>רמז</h3>' +
    lines.map(l => '<div>' + escapeHtml(l) + '</div>').join('') + '</div>';
}

function showLightsTrick() {
  document.getElementById('hintBox').innerHTML =
    '<div class="hint-box"><h3>שיטת אורות (יסוד)</h3>' +
    '<div><strong>לבן בודד:</strong> אור עוגן או אור ירכתיים.</div>' +
    '<div><strong>שני לבנים אנכיים:</strong> כלי הספק > 50 מ׳.</div>' +
    '<div><strong>אדום + ירוק (חזיתי):</strong> רואים מהחרטום.</div>' +
    '<div><strong>אדום בלבד:</strong> רואים את הצד השמאלי (Port).</div>' +
    '<div><strong>ירוק בלבד:</strong> רואים את הצד הימני (Starboard).</div>' +
    '<div><strong>2 אדומים אנכי:</strong> NUC — אינו שולט.</div>' +
    '<div><strong>אדום-לבן-אדום:</strong> RAM — מוגבל בכושר תמרון.</div>' +
    '<div><strong>3 אדומים אנכי:</strong> CBD — מוגבל מחמת שוקע.</div>' +
    '</div>';
}

// ================================ image panel ========================
function renderImagePanel(q) {
  const tabs = document.getElementById('imageTabs');
  const frame = document.getElementById('imageFrame');
  const zoom = document.getElementById('imageZoom');
  tabs.innerHTML = '';
  frame.innerHTML = '';
  if (!q.images || !q.images.length) {
    zoom.hidden = true;
    frame.innerHTML = '<div class="image-empty">לשאלה זו אין תמונה משויכת.<br><br>אם בכל זאת מופיעה הפניה לתמונה, השתמש בכפתור "תיקון נתונים" להוספה ידנית.</div>';
    return;
  }
  zoom.hidden = false;
  for (const n of q.images) {
    const b = document.createElement('button');
    b.textContent = 'תמונה ' + n;
    b.dataset.imgnum = n;
    b.classList.toggle('active', n === STATE.ui.currentImg);
    b.onclick = () => { STATE.ui.currentImg = n; renderImagePanel(q); renderExplanationPanel(); saveState(); };
    tabs.appendChild(b);
  }
  const num = STATE.ui.currentImg || q.images[0];
  // Custom upload takes precedence
  const custom = STATE.customImages[num];
  if (custom) {
    const img = document.createElement('img');
    img.src = custom;
    img.style.transform = 'scale(' + (STATE.ui.zoom / 100) + ')';
    img.style.transformOrigin = 'center center';
    if (STATE.ui.cleanView) frame.classList.add('image-clean'); else frame.classList.remove('image-clean');
    frame.appendChild(img);
  } else {
    // Fallback: PDF-embed scoped to first page (we don't know which page each
    // numbered sign is on; the user can scroll to find it, OR upload a crop).
    frame.classList.remove('image-clean');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#fff;color:#333;padding:18px;text-align:center;font-size:14px;width:100%;';
    wrap.innerHTML = '<div style="margin-bottom:10px;font-weight:600;">תמונה ' + num + ' — אין גזירה מוטמעת</div>' +
      '<div style="margin-bottom:14px;color:#555;">פתח את גיליון הסימונים הרשמי כדי לאתר את התמונה, או העלה גזירה מקומית.</div>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
      '<a href="' + PDF_DATA_URI + '" target="_blank" style="background:#0d1b2a;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;">פתיחת PDF הסימונים</a>' +
      '</div>';
    frame.appendChild(wrap);
  }
  document.getElementById('zoomLabel').textContent = STATE.ui.zoom + '%';
}

document.addEventListener('click', (e) => {
  const z = e.target.closest('button[data-zoom]');
  if (z) {
    const delta = Number(z.dataset.zoom);
    STATE.ui.zoom = Math.max(50, Math.min(300, STATE.ui.zoom + delta * 25));
    saveState();
    if (STATE.ui.currentQId) renderImagePanel(QUESTIONS_BY_ID[STATE.ui.currentQId]);
  }
});

// ================================ explanation ========================
function renderExplanationPanel() {
  const num = STATE.ui.currentImg;
  const target = document.getElementById('explanationContent');
  if (!num) {
    target.innerHTML = '<div class="exp-empty">לשאלה זו אין תמונה — אין הסבר אורות.</div>';
    return;
  }
  const ex = STATE.explanations[num];
  if (!ex) {
    target.innerHTML = '<div class="exp-empty">אין הסבר עדיין לתמונה ' + num +
      '.<br><br><span class="unverified-tag">דורש בדיקה ידנית</span>' +
      '<br><br>הוסף הסבר מהכפתור למטה.</div>';
    return;
  }
  const v = ex.verified ? '' : '<span class="unverified-tag">דורש בדיקה ידנית</span>';
  let h = '<h3 style="margin-top:0;">תמונה ' + num + ' ' + v + '</h3>';
  if (ex.official) h += '<div class="exp-section"><h3>1. מסקנה רשמית</h3><p>' + escapeHtml(ex.official) + '</p></div>';
  if (ex.whatWeSee) h += '<div class="exp-section"><h3>2. מה רואים</h3><p>' + escapeHtml(ex.whatWeSee) + '</p></div>';
  if (Array.isArray(ex.breakdown) && ex.breakdown.length) {
    h += '<div class="exp-section"><h3>3. פירוט לפי אורות</h3><ul>' +
      ex.breakdown.map(b => '<li>' + escapeHtml(b) + '</li>').join('') +
      '</ul></div>';
  }
  if (ex.direction) h += '<div class="exp-section"><h3>4. כיוון יחסי</h3><p>' + escapeHtml(ex.direction) + '</p></div>';
  if (ex.conclusion) h += '<div class="exp-section"><h3>5. סיכום פשוט</h3><p>' + escapeHtml(ex.conclusion) + '</p></div>';
  if (ex.commonMistake) h += '<div class="exp-section"><h3>6. טעות נפוצה</h3><p>' + escapeHtml(ex.commonMistake) + '</p></div>';
  if (ex.memoryTrick) h += '<div class="exp-section"><h3>7. שיטת זיכרון</h3><p>' + escapeHtml(ex.memoryTrick) + '</p></div>';
  target.innerHTML = h;
}

function openExplanationEditor() {
  const num = STATE.ui.currentImg;
  if (!num) { showToast('בחר תמונה קודם.'); return; }
  const ex = STATE.explanations[num] || { verified: false };
  openModal('עריכת הסבר תמונה ' + num, \`
    <label>מסקנה רשמית
      <textarea id="ex-official">\${escapeHtml(ex.official || '')}</textarea>
    </label>
    <label>מה רואים
      <textarea id="ex-whatWeSee">\${escapeHtml(ex.whatWeSee || '')}</textarea>
    </label>
    <label>פירוט לפי אורות (כל שורה = פריט נפרד)
      <textarea id="ex-breakdown">\${escapeHtml((ex.breakdown || []).join('\\n'))}</textarea>
    </label>
    <label>כיוון יחסי
      <input type="text" id="ex-direction" value="\${escapeHtml(ex.direction || '')}">
    </label>
    <label>סיכום פשוט
      <textarea id="ex-conclusion">\${escapeHtml(ex.conclusion || '')}</textarea>
    </label>
    <label>טעות נפוצה
      <textarea id="ex-commonMistake">\${escapeHtml(ex.commonMistake || '')}</textarea>
    </label>
    <label>שיטת זיכרון
      <textarea id="ex-memoryTrick">\${escapeHtml(ex.memoryTrick || '')}</textarea>
    </label>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px;">
      <input type="checkbox" id="ex-verified" \${ex.verified ? 'checked' : ''}> מאומת (לא "דורש בדיקה ידנית")
    </label>
    <div class="modal-buttons">
      <button data-close>ביטול</button>
      <button class="primary" id="saveExBtn">שמור</button>
    </div>
  \`);
  document.getElementById('saveExBtn').onclick = () => {
    STATE.explanations[num] = {
      official: document.getElementById('ex-official').value.trim(),
      whatWeSee: document.getElementById('ex-whatWeSee').value.trim(),
      breakdown: document.getElementById('ex-breakdown').value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean),
      direction: document.getElementById('ex-direction').value.trim(),
      conclusion: document.getElementById('ex-conclusion').value.trim(),
      commonMistake: document.getElementById('ex-commonMistake').value.trim(),
      memoryTrick: document.getElementById('ex-memoryTrick').value.trim(),
      verified: document.getElementById('ex-verified').checked
    };
    saveState();
    renderExplanationPanel();
    closeModal();
    showToast('ההסבר נשמר.');
  };
}

// ================================ image upload =======================
function uploadImageCrop() {
  const num = STATE.ui.currentImg;
  if (!num) { showToast('בחר תמונה קודם.'); return; }
  openModal('העלאת גזירה לתמונה ' + num, \`
    <p style="font-size:13px;color:var(--muted);">בחר קובץ PNG/JPG מהמכשיר. הגזירה נשמרת מקומית בלבד (localStorage).</p>
    <input type="file" id="cropFile" accept="image/png,image/jpeg,image/webp">
    <div class="modal-buttons">
      <button data-close>ביטול</button>
      <button class="primary" id="saveCropBtn">שמור</button>
      \${STATE.customImages[num] ? '<button class="danger" id="delCropBtn">מחק קיים</button>' : ''}
    </div>
  \`);
  document.getElementById('saveCropBtn').onclick = () => {
    const f = document.getElementById('cropFile').files[0];
    if (!f) { showToast('לא נבחר קובץ.'); return; }
    const r = new FileReader();
    r.onload = () => {
      STATE.customImages[num] = r.result;
      saveState();
      renderImagePanel(QUESTIONS_BY_ID[STATE.ui.currentQId]);
      closeModal();
      showToast('הגזירה נשמרה.');
    };
    r.readAsDataURL(f);
  };
  const del = document.getElementById('delCropBtn');
  if (del) del.onclick = () => {
    delete STATE.customImages[num];
    saveState();
    renderImagePanel(QUESTIONS_BY_ID[STATE.ui.currentQId]);
    closeModal();
    showToast('נמחק.');
  };
}

// ================================ stats ==============================
function renderStats() {
  const total = DATA.questions.length;
  const seen = Object.keys(STATE.questions).filter(id => STATE.questions[id].attempts.length).length;
  const correct = Object.keys(STATE.questions).filter(id => STATE.questions[id].lastResult === 'correct').length;
  const wrong = Object.keys(STATE.questions).filter(id => STATE.questions[id].lastResult === 'wrong').length;
  const guesses = Object.keys(STATE.questions).filter(id => STATE.questions[id].markedAsGuess).length;
  const dueToday = DATA.questions.filter(q => isDue(q.id)).length;
  const mastery = total ? Math.round(100 * correct / total) : 0;
  document.getElementById('stats').innerHTML =
    cell(mastery + '%', 'שליטה') +
    cell(seen + '/' + total, 'נראו') +
    cell(dueToday, 'לסקירה היום') +
    cell(wrong + ' / ' + guesses, 'טעויות / ניחושים');
}
function cell(num, lbl) {
  return '<div class="stat"><div class="num">' + num + '</div><div class="lbl">' + lbl + '</div></div>';
}
function renderModeNav() {
  const wrap = document.getElementById('modeNav');
  wrap.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.textContent = m.label;
    b.classList.toggle('active', STATE.ui.mode === m.id);
    b.onclick = () => setMode(m.id);
    wrap.appendChild(b);
  }
}
function setMode(id) {
  STATE.ui.mode = id;
  saveState();
  renderModeNav();
  const m = MODES.find(x => x.id === id);
  const next = m.pick();
  if (next != null) showQuestion(next);
}

// ================================ next-question ======================
function nextQuestion() {
  const m = MODES.find(x => x.id === STATE.ui.mode) || MODES[0];
  const next = m.pick();
  if (next != null) showQuestion(next);
}

// ================================ modals =============================
function openModal(title, html) {
  const o = document.getElementById('modalOverlay');
  document.getElementById('modalContent').innerHTML = '<h2>' + title + '</h2>' + html;
  o.classList.add('show');
  o.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  o.onclick = (e) => { if (e.target === o) closeModal(); };
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

// ================================ backup =============================
function exportJSON() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'yamaot30-progress-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showToast('יצוא הושלם — בדוק תיקיית הורדות.');
}
function importJSON() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj || obj.version == null) throw new Error('פורמט לא מזוהה.');
        if (!confirm('פעולה זו תחליף את ההתקדמות הנוכחית. להמשיך?')) return;
        STATE = Object.assign({}, DEFAULT_STATE, obj,
          { ui: Object.assign({}, DEFAULT_STATE.ui, obj.ui || {}) });
        saveState();
        renderStats();
        renderModeNav();
        if (STATE.ui.currentQId) showQuestion(STATE.ui.currentQId);
        else nextQuestion();
        showToast('ייבוא הושלם.');
      } catch (e) {
        showToast('שגיאה: ' + e.message);
      }
    };
    r.readAsText(f);
  };
  inp.click();
}
function resetProgress() {
  if (!confirm('למחוק את כל ההתקדמות והערות? פעולה זו אינה הפיכה (אלא אם יש לך גיבוי).')) return;
  STATE = seedState();
  saveState();
  renderStats(); renderModeNav();
  nextQuestion();
  showToast('האיפוס בוצע.');
}

// ================================ wiring =============================
document.getElementById('hintBtn').onclick = showHint;
document.getElementById('lightsBtn').onclick = showLightsTrick;
document.getElementById('guessBtn').onclick = () => {
  document.body.dataset.pendingGuess = '1';
  showToast('הבחירה הבאה תסומן כניחוש.');
};
document.getElementById('skipBtn').onclick = () => nextQuestion();
document.getElementById('nextBtn').onclick = () => nextQuestion();
document.getElementById('exportBtn').onclick = exportJSON;
document.getElementById('importBtn').onclick = importJSON;
document.getElementById('resetBtn').onclick = resetProgress;
document.getElementById('aboutBtn').onclick = () => openModal('אודות', \`
  <p><strong>ימאות 30 — אפליקציית לימוד</strong></p>
  <p>קובץ יחיד, פועל מקומית מ-<code>file://</code>, שומר ב-localStorage.</p>
  <ul>
    <li>362 שאלות מתוך מאגר israelsails.com</li>
    <li>תשובות נכונות מאומתות מהמקור</li>
    <li>הסברים מפורטים מובנים לתמונות 22, 25, 66</li>
    <li>סבב חכם, חזרה מרווחת, מבחן 50, מאגר חיפוש</li>
    <li>גיבוי/שחזור JSON להעברה בין מכשירים</li>
  </ul>
  <p style="font-size:12px;color:var(--muted);">תיוג קטגוריות בוצע אוטומטית לפי מילות מפתח. ערוך ידנית בעת הצורך.</p>
  <div class="modal-buttons"><button class="primary" data-close>סגירה</button></div>
\`);
document.getElementById('cleanBtn').onclick = () => {
  STATE.ui.cleanView = !STATE.ui.cleanView;
  saveState();
  if (STATE.ui.currentQId) renderImagePanel(QUESTIONS_BY_ID[STATE.ui.currentQId]);
};
document.getElementById('uploadCropBtn').onclick = uploadImageCrop;
document.getElementById('editExplanationBtn').onclick = openExplanationEditor;
document.getElementById('noteText').addEventListener('input', (e) => {
  if (!STATE.ui.currentQId) return;
  qState(STATE.ui.currentQId).notes = e.target.value;
  saveState();
});

// Init
renderModeNav();
renderStats();
if (STATE.ui.currentQId && QUESTIONS_BY_ID[STATE.ui.currentQId]) {
  showQuestion(STATE.ui.currentQId);
} else {
  nextQuestion();
}
</script>
</body>
</html>
`;

const outPath = path.join(HERE, 'yamaot30-study.html');
fs.writeFileSync(outPath, html, 'utf8');
const stat = fs.statSync(outPath);
console.log('Wrote', outPath, '(', (stat.size / 1024).toFixed(1), 'KB)');
console.log('Questions:', questions.length);
console.log('Answer keys:', questions.filter(q => q.correct).length);
console.log('Image refs:', new Set(questions.flatMap(q => q.images)).size);
console.log('Seed explanations:', Object.keys(seedExplanations).length, '(images', Object.keys(seedExplanations).join(', ') + ')');

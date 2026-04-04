const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, 'state.json');
const siteDir = path.join(__dirname, 'site');
const indexPath = path.join(siteDir, 'index.html');
const rootIndexPath = path.join(__dirname, '..', 'index.html');
const archiveDir = path.join(siteDir, 'archive');

if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

let state = { archive: [] };
if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

const links = (state.archive || []).map(f => {
  const date = f.replace('.html', '');
  return `<li><a href="./archive/${f}?v=${date}">${date}</a></li>`;
}).join('\n');

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0; url=./latest.html?v=${Date.now()}" />
  <title>Clawy News</title>
  <style>body{font-family:Segoe UI,Arial,sans-serif;background:#0a1422;color:#eef4ff;margin:0;padding:24px}a{color:#9fdcff}ul{line-height:1.8}</style>
</head>
<body>
  <h1>Clawy News</h1>
  <p><a href="./latest.html?v=${Date.now()}">מעבר לדשבורד האחרון</a></p>
  <h2>ארכיון 7 ימים</h2>
  <ul>${links}</ul>
</body>
</html>`;

fs.writeFileSync(indexPath, html, 'utf8');

const rootHtml = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0; url=./news-dashboard/site/latest.html?v=${Date.now()}" />
  <title>Clawy News</title>
</head>
<body>
  <a href="./news-dashboard/site/latest.html?v=${Date.now()}">Clawy News</a>
</body>
</html>`;
fs.writeFileSync(rootIndexPath, rootHtml, 'utf8');

console.log(indexPath);

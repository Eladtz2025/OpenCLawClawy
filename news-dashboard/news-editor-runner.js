const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const OUT_DIR = __dirname;
const TMP_DIR = path.join(OUT_DIR, '.editor-runtime');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function applyEditorSelection(topicKey, scoredItems) {
  ensureDir(TMP_DIR);
  const inputPath = path.join(TMP_DIR, `${topicKey}-candidates.json`);
  const outputPath = path.join(TMP_DIR, `${topicKey}-selected.json`);
  fs.writeFileSync(inputPath, JSON.stringify(scoredItems, null, 2), 'utf8');

  const prefiltered = scoredItems.filter(item => {
    const hay = `${item.title || ''} ${item.sourceUrl || ''} ${item.source || ''}`.toLowerCase();
    if (topicKey === 'technology' && /podcast|scale up nation|livestream|join our livestream/.test(hay)) return false;
    if (topicKey === 'crypto' && /press-release|sponsored-content|largest publicly traded|publicly traded ethereum treasury firms|documentation and governance|unicoin foundation|startale expands/.test(hay)) return false;
    if (topicKey === 'hapoel' && /מכירת מנוי|מנויים|כרטיסים|מתווה הכרטיסים/.test(hay)) return false;
    return true;
  });
  fs.writeFileSync(inputPath, JSON.stringify(prefiltered, null, 2), 'utf8');

  const run = spawnSync(process.execPath, [path.join(OUT_DIR, 'news-editor-agent.js'), topicKey, inputPath, outputPath], {
    cwd: OUT_DIR,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    }
  });

  if (run.status !== 0) {
    return {
      ok: false,
      error: run.stderr || run.stdout || `editor_exit_${run.status}`
    };
  }

  if (!fs.existsSync(outputPath)) {
    return {
      ok: false,
      error: 'editor_no_output'
    };
  }

  try {
    const selected = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { ok: true, selected };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

module.exports = { applyEditorSelection };

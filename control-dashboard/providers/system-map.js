// Status provider for the System Map (registry + recent changelog + skills + TODOs).
const fs = require('fs');
const path = require('path');
const { readJsonOpt, readTextOpt, resolveWorkspacePath, loadRegistry, DASHBOARD_ROOT, WORKSPACE } = require('../lib/runtime');

function listSkills(skillsRoot) {
  try {
    const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => {
        const skillMd = path.join(skillsRoot, e.name, 'SKILL.md');
        let description = null;
        try {
          const raw = fs.readFileSync(skillMd, 'utf8');
          const m = raw.match(/^description:\s*(.+)$/m);
          if (m) description = m[1].trim();
        } catch {}
        return { name: e.name, path: skillMd, description };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

function recentChangelog(filePath, sectionsLimit = 2) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // Split by H2 (## ) headings; keep the first N sections after the title.
    const lines = raw.split(/\r?\n/);
    const sections = [];
    let cur = null;
    for (const line of lines) {
      if (/^## /.test(line)) {
        if (cur) sections.push(cur);
        cur = { heading: line.replace(/^## /, '').trim(), lines: [] };
      } else if (cur) {
        cur.lines.push(line);
      }
    }
    if (cur) sections.push(cur);
    return sections.slice(0, sectionsLimit).map(s => ({
      heading: s.heading,
      content: s.lines.join('\n').trim().slice(0, 8000)
    }));
  } catch { return []; }
}

async function status(system) {
  const reg = loadRegistry();
  const todos = readJsonOpt(path.join(DASHBOARD_ROOT, 'registry', 'system-map-todos.json')) || { items: [] };
  const nextWork = readJsonOpt(path.join(DASHBOARD_ROOT, 'registry', 'system-map-next-work.json')) || { items: [] };

  const skillsRoot = path.resolve(WORKSPACE, 'skills', '_custom');
  const skills = listSkills(skillsRoot);

  const changelogPath = path.resolve(WORKSPACE, '..', 'CHANGELOG.md'); // ~/.openclaw/CHANGELOG.md
  const changelog = recentChangelog(changelogPath, 2);

  const issues = [];
  // Surface medium+ TODOs as issues
  for (const t of (todos.items || [])) {
    if (t.severity && t.severity !== 'low') issues.push(`TODO ${t.id} (${t.severity}): ${t.title}`);
  }

  return {
    ok: issues.length === 0,
    headline: issues.length ? 'ATTENTION' : 'OK',
    summary: `${(reg.systems || []).length} systems, ${skills.length} custom skills, ${(todos.items || []).length} TODOs`,
    registry: (reg.systems || []).map(s => ({
      alias: s.alias,
      name: s.name,
      summary: s.summary,
      telegram: s.telegram,
      actionsCount: (s.actions || []).length,
      skillsCount: (s.skills || []).length
    })),
    aliases: (reg.systems || []).reduce((acc, s) => {
      acc[s.alias] = { name: s.name, telegramTopic: s.telegram?.topicId ?? null };
      return acc;
    }, {}),
    customSkills: skills,
    recentChangelog: changelog,
    todos: todos.items || [],
    recommendedNext: nextWork.items || [],
    files: {
      registry: path.join(DASHBOARD_ROOT, 'registry', 'systems.json'),
      todos: path.join(DASHBOARD_ROOT, 'registry', 'system-map-todos.json'),
      nextWork: path.join(DASHBOARD_ROOT, 'registry', 'system-map-next-work.json'),
      changelog: changelogPath
    },
    issues
  };
}

async function action(system, name) {
  if (name === 'refresh') {
    // Stateless — status() always reads fresh.
    return { ok: true, refreshed: true, ts: new Date().toISOString() };
  }
  return { error: `unknown action: ${name}` };
}

module.exports = { status, action };

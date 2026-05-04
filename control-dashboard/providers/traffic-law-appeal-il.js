// Status provider for the Traffic-Law-Appeal-IL agent.
// This system has no server-side actions — the dashboard page renders an
// "Open chat" button that hops to the Claude Code tab and prefills the
// agent's start prompt. The provider's job is to expose:
//   - the kickoff prompt text
//   - the catalogue of files / skills to surface on the page
//   - a parsed view of any output drafts (grouped by request type)
//   - optional case-state.json the agent may have written, for current-case
//     status, deadlines and missing-evidence summary

const fs = require('fs');
const path = require('path');
const { readTextOpt, readJsonOpt, resolveWorkspacePath } = require('../lib/runtime');

// The start-appeal.md file is structured as
//   # Prompt — ...
//   <preamble>
//   ---
//   <the actual text the user pastes into a chat>
// Strip the preamble so the Claude tab gets only the body.
function extractKickoffPrompt(raw) {
  if (!raw) return '';
  const idx = raw.indexOf('\n---\n');
  return idx >= 0 ? raw.slice(idx + 5).trim() : raw.trim();
}

// Each draft filename starts with one of three prefixes that maps to a
// specific drafter skill. We use this to tell the user at a glance whether
// the agent produced a cancellation request, a warning conversion, or a
// "request to be tried" filing.
function classifyDraft(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith('appeal-'))         return { type: 'cancellation', label: 'בקשת ביטול' };
  if (lower.startsWith('warning-'))        return { type: 'warning',      label: 'בקשה להמרה לאזהרה' };
  if (lower.startsWith('court-request-'))  return { type: 'court',        label: 'בקשה להישפט / ערר' };
  if (lower.startsWith('inspection-request-')) return { type: 'inspection', label: 'בקשת עיון בראיות' };
  return { type: 'other', label: 'מסמך' };
}

function listOutputDrafts(outputDir) {
  try {
    const abs = resolveWorkspacePath(outputDir);
    return fs.readdirSync(abs, { withFileTypes: true })
      .filter(e => e.isFile() && !e.name.startsWith('.') && /\.md$/i.test(e.name))
      .map(e => {
        const full = path.join(abs, e.name);
        const st = fs.statSync(full);
        const cls = classifyDraft(e.name);
        return {
          name: e.name, path: full, sizeBytes: st.size, mtime: st.mtime.toISOString(),
          type: cls.type, label: cls.label
        };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
      .slice(0, 30);
  } catch { return []; }
}

// case-state.json is an OPTIONAL file the agent may write to share its
// current-case view with the dashboard. Schema (best-effort, all fields
// optional):
//   {
//     "ticketNumber": "...",
//     "serviceDate":  "YYYY-MM-DD",
//     "offenseDate":  "YYYY-MM-DD",
//     "category":     "A"|"B"|"C"|"D",
//     "deadlines":    { "cancellation30": "YYYY-MM-DD", ... },
//     "chosenRoute":  "cancellation"|"warning"|"court"|"undecided",
//     "missingEvidence": ["..."],
//     "nextAction":   "...",
//     "lastDraft":    "appeal-...md",
//     "updatedAt":    "ISO"
//   }
// Non-existence is normal — many sessions don't bother writing it.
function readCaseState(outputDir) {
  try {
    const abs = resolveWorkspacePath(outputDir);
    const p = path.join(abs, 'case-state.json');
    if (!fs.existsSync(p)) return null;
    return readJsonOpt(p);
  } catch { return null; }
}

function daysFromTodayTo(yyyymmdd) {
  if (!yyyymmdd || typeof yyyymmdd !== 'string') return null;
  const d = new Date(yyyymmdd + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function summariseDeadlines(state) {
  if (!state || !state.deadlines || typeof state.deadlines !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(state.deadlines)) {
    const days = daysFromTodayTo(v);
    let level = 'ok';
    if (days != null) {
      if (days < 0)        level = 'expired';
      else if (days <= 7)  level = 'urgent';
      else if (days <= 14) level = 'warn';
    }
    out.push({ key: k, date: v, daysLeft: days, level });
  }
  return out.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
}

const EXPECTED_SKILLS = [
  '_custom/traffic-ticket-parser-il',
  '_custom/traffic-offense-classifier-il',
  '_custom/traffic-deadline-risk-check-il',
  '_custom/traffic-law-research-il',
  '_custom/traffic-case-law-and-regulation-research-il',
  '_custom/traffic-police-procedure-check-il',
  '_custom/traffic-camera-radar-evidence-check-il',
  '_custom/traffic-appeal-strategy-il',
  '_custom/traffic-evidence-checklist-il',
  '_custom/traffic-risk-assessment-il',
  '_custom/traffic-appeal-letter-drafter-il',
  '_custom/traffic-clean-record-warning-request-il',
  '_custom/traffic-court-request-drafter-il',
  '_custom/traffic-next-actions-il'
];

function checkSkillsOnDisk(skills) {
  const root = resolveWorkspacePath('skills');
  const out = { present: [], missing: [] };
  for (const s of skills) {
    const p = path.join(root, s, 'SKILL.md');
    if (fs.existsSync(p)) out.present.push(s);
    else out.missing.push(s);
  }
  return out;
}

async function status(system) {
  const F = system.files;
  const startPromptPath = resolveWorkspacePath(F.startPrompt);
  const startPromptRaw = readTextOpt(startPromptPath, 16000) || '';
  const startPromptText = extractKickoffPrompt(startPromptRaw);

  const filesAbs = {};
  for (const [k, v] of Object.entries(F)) filesAbs[k] = resolveWorkspacePath(v);

  const drafts = listOutputDrafts(F.outputDir);
  const draftsByType = drafts.reduce((acc, d) => {
    (acc[d.type] = acc[d.type] || []).push(d);
    return acc;
  }, {});
  const latestByType = Object.fromEntries(
    Object.entries(draftsByType).map(([t, list]) => [t, list[0]])
  );

  const caseState = readCaseState(F.outputDir);
  const deadlinesView = summariseDeadlines(caseState);
  const earliestDeadline = deadlinesView[0] || null;

  const skillCheck = checkSkillsOnDisk(EXPECTED_SKILLS);
  const issues = [];
  if (skillCheck.missing.length) {
    issues.push(`חסרים ${skillCheck.missing.length} סקילים: ${skillCheck.missing.join(', ')}`);
  }
  if (earliestDeadline && (earliestDeadline.level === 'urgent' || earliestDeadline.level === 'expired')) {
    const lbl = earliestDeadline.level === 'expired' ? 'חלף' : 'נשארו ימים בודדים';
    issues.push(`מועד ${earliestDeadline.key}: ${earliestDeadline.date} — ${lbl}`);
  }

  // Build the next-action recommendation. Order of preference:
  //   1. agent-supplied caseState.nextAction
  //   2. urgent deadline → "submit now"
  //   3. has draft → "review and submit"
  //   4. no drafts → "open chat to start"
  let recommendedNext;
  if (caseState && caseState.nextAction) {
    recommendedNext = [caseState.nextAction];
  } else if (earliestDeadline && earliestDeadline.level === 'urgent') {
    recommendedNext = [`Deadline ${earliestDeadline.key} is in ${earliestDeadline.daysLeft}d — finalise the draft and file today/tomorrow.`];
  } else if (drafts.length) {
    recommendedNext = [`Continue from latest draft: ${drafts[0].name} (${drafts[0].label})`];
  } else {
    recommendedNext = ['Click OPEN CHAT WITH AGENT to start a new appeal in the Claude tab'];
  }

  return {
    ok: true,
    headline: issues.length ? 'ATTENTION' : 'OK',
    summary: `${skillCheck.present.length}/${EXPECTED_SKILLS.length} skills · ${drafts.length} draft${drafts.length === 1 ? '' : 's'} · ${caseState ? 'case-state ✓' : 'no case-state.json'}`,
    agentRoot: path.dirname(resolveWorkspacePath(F.agent)),
    startPromptText,
    skills: system.skills || [],
    skillCheck,
    drafts,
    draftsByType,
    latestByType,
    caseState,
    deadlines: deadlinesView,
    files: filesAbs,
    issues,
    recommendedNext
  };
}

async function action(_system, name) {
  // The single user-facing action ("open chat") is handled entirely in the
  // browser — it navigates to the Claude tab and prefills the prompt. There
  // is nothing to run server-side, so any action call here is unexpected.
  return { error: `unknown action: ${name}` };
}

module.exports = { status, action };

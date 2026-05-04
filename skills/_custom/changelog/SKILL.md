---
name: changelog
description: Append a single dated entry to ~/.openclaw/CHANGELOG.md whenever a meaningful change is made to the OpenClaw setup. Refuses to do anything else.
---

# changelog

## Why
A single source of truth for "what changed in OpenClaw and when." Entries
must be terse and self-explanatory so future-Clawy (or Elad) can read the
log a year from now and still understand it.

## File
`C:\Users\Itzhak\.openclaw\CHANGELOG.md`

## Format

ISO-date headings, descending. One bullet per change. Each bullet should:

1. Lead with the verb of the change (Added / Edited / Disabled / Archived /
   Restored / Built / Fixed).
2. Name the artifact with a path or id.
3. State the reason in one short clause ("Reason: ...").
4. State how to reverse it ("Reverse: ...") whenever the change is
   reversible. Omit only if intrinsically irreversible.

Example:

```markdown
## 2026-05-02

- Disabled cron job `organizer-v2-continuation`
  (id `833bcc23-...`): set `enabled: false`.
  Reason: 7 consecutive failures, docker daemon unreachable.
  Reverse: flip `enabled` back to `true`. Backup at
  `cron/jobs.json.bak-2026-05-02-pre-disable`.
```

## Rules

- One entry per logical change. Don't batch unrelated edits.
- If the same heading already exists, append under it; don't create a duplicate.
- If a change is reverted, add a NEW bullet ("Reverted: ...") under today —
  do NOT delete the original entry.
- Never mention secrets, tokens, or credentials. Reference paths only.
- The changelog is append-mostly. Edits to existing entries are allowed
  only to fix typos / wrong paths.

## When to use this skill

Any change Clawy makes to:
- `~/.openclaw/cron/jobs.json`
- `~/.openclaw/agents/`
- `~/.openclaw/workspace/skills/` (add/archive/move)
- `~/.openclaw/workspace/IDENTITY.md`, `AGENTS.md`, `SOUL.md`, `USER.md`
- `~/.openclaw/extensions/`
- `~/.openclaw/plugins/installs.json`
- Anything that affects how OpenClaw runs across sessions

Routine workspace edits inside a project (e.g.,
`workspace/news-dashboard/*.js` tweaks during normal pipeline iteration)
do NOT need a changelog entry. Use judgement: if a future session would
ask "wait, why is this like this?", write an entry.

---
name: organizer-gmail
description: Gmail Cleanup & Organizer module of Organizer V2. Talks to the local @presto-ai/google-workspace-mcp via mcporter. Auth-aware. Apply mode applies LABELS only — never sends, deletes, or archives.
---

# organizer-gmail

The "Gmail" module of the Organizer V2 suite. Auth-aware. Defaults to label-only operations.

## Tooling stack

- **mcporter**: `~/.openclaw/workspace/gmail-audit/node_modules/.bin/mcporter.cmd`
- **MCP server**: `@presto-ai/google-workspace-mcp` (local install)
- **Auth marker**: `~/.openclaw/workspace/organizer/state/gmail-user-session-success.json`
- **Tools used**: `people.getMe`, `gmail.search`, `gmail.modify`, `gmail.listLabels`

Auth flow lives entirely inside the MCP server's stored OAuth token (set up
previously with `bootstrap-gmail-auth.ps1`). This module never asks for
passwords or codes in chat.

## Verbs

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail auth
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail scan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail plan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail approve
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail apply         # dry-run by default
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail doctor
```

## Auth decisions

`auth` returns one of:

| decision | meaning |
|---|---|
| `authenticated` | `people.getMe` returned 0; runner is healthy. |
| `authenticated_via_marker_runner_blocked` | Past success marker exists but the current runner times out. |
| `runner_timeout_auth_unknown` | Runner did not return in time; auth state unknown. |
| `unauthenticated` | No marker, runner errored. |

The module only attempts live scans when decision is `authenticated`.
Otherwise it emits a clean "preview-blocked" scan with empty buckets.

## Scan queries

Each query maps to a Gmail search expression and is executed through
`gmail.search` (`max-results=50` per query). Caps prevent unbounded mailboxes.

| key | Gmail query |
|---|---|
| `large` | `has:attachment larger:5M` |
| `old_unread` | `is:unread older_than:1y` |
| `newsletters` | `list:* OR unsubscribe` |
| `promotions` | `category:promotions` |

## Plan and apply

Plan emits `proposedLabel` per kind:

| kind | label |
|---|---|
| large-attachment | `Cleanup/Large` |
| old-unread | `Cleanup/OldUnread` |
| newsletter | `Cleanup/Newsletter` |
| promotional | `Cleanup/Promo` |
| noisy-sender | `Cleanup/Noisy` |

**Apply is label-only.** Even with `--no-dry-run` the module never:
- sends mail (`gmail.send`, `gmail.sendDraft` are not called)
- deletes mail
- archives mail
- moves mail
- modifies any label other than the proposed `Cleanup/*`

Live apply path: for each kind, runs `gmail.search` to get message IDs (cap 25), then `gmail.modify message-id=… add-labels=Cleanup/...` per message. Tracked per item in `apply-log.json`.

## Hard rules

- Default: dry-run.
- Never delete.
- Never send.
- Never modify labels outside the `Cleanup/*` namespace declared by plan.
- Never re-run apply on the same approval package without explicit human re-trigger.

## Rollback

Labels are recoverable: open Gmail, multi-select messages with the `Cleanup/*` label, and remove the label. No data loss.

## Files

- `modules/gmail/state.json` — module state
- `modules/gmail/reports/scan-summary.json` + `scan-report.md`
- `modules/gmail/reports/plan.json` + `plan.md`
- `modules/gmail/reports/approval-package.json` + `approval-package.md`
- `modules/gmail/reports/apply-log.json` + `apply-log.md`
- `modules/gmail/logs/module.log`

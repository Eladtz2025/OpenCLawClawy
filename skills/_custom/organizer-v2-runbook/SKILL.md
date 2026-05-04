---
name: organizer-v2-runbook
description: Master runbook for Organizer V2 (Computer + Gmail + Photos modules). Covers tick, doctor, per-module verbs, retry-budget, rollback, and exact one-line commands for daily ops.
---

# Organizer V2 — master runbook

Three independent modules under one orchestrator. No Docker. No LLM ticks.
Modules are opt-in. Apply is dry-run by default.

## Single CLI

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" <module> <verb> [...]
```

Verbs:

| Module | Verbs |
|--------|-------|
| computer | scan, plan, approve, apply, doctor |
| gmail    | auth, scan, plan, approve, apply, doctor |
| photos   | auth, scan, plan, approve, apply, doctor |

Plus cross-cutting:

```powershell
node ".../orgctl.js" doctor                         # cross-module health
powershell -ExecutionPolicy Bypass -File ".../organizer/scripts/tick.ps1"   # one orchestrator tick
node ".../skills/_custom/cron-guard/scripts/cron-guard.js"                   # cron loop watchdog
```

## Daily ops cheatsheet

```powershell
# A. quick health (read-only, ~1s):
node "C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\doctor.js"

# B. refresh computer scan + dry-run apply (full pipeline, never destructive):
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer scan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer plan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer approve
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer apply

# C. real (non-dry-run) computer cleanup, recycle-bin only:
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\Itzhak\.openclaw\workspace\organizer\modules\computer\computer.ps1" `
  -Verb apply -NoDryRun

# D. Gmail dry-run cleanup (label-only):
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail scan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail plan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail approve
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" gmail apply

# E. Real Gmail label-add (still no deletes):
node "C:\Users\Itzhak\.openclaw\workspace\organizer\modules\gmail\gmail.js" apply --no-dry-run

# F. Photos auth — submit code after consenting in browser:
python "C:\Users\Itzhak\.openclaw\workspace\organizer\modules\photos\photos.py" auth --code "PASTE_CODE_HERE"
```

## Module enables

`organizer/state/orchestrator.json` controls per-module enable flags.

| module | default | flip-to-on path |
|--------|---------|-----------------|
| computer | `enabled: true` | already on |
| gmail | `enabled: true` | already on (auth verified 2026-05-02) |
| photos | `enabled: false` | finish OAuth (see Photos skill) → set `enabled: true` |

## Retry-budget rule

`organizer/scripts/tick.ps1` increments `consecutiveBlockedTicks` for any
module that returns `blocked_auth`. After `maxBlockedTicksBeforeQuiet` (6) the
module enters `quieted` state and is skipped silently. The cron-guard skill
also watches for cron-level loops.

To re-arm a quieted module: edit `orchestrator.json`, set
`consecutiveBlockedTicks: 0` and `enabled: true`, then run a tick.

## Approval-package contract

Every module writes:
- `reports/approval-package.json` — items + `contractSha1`
- `reports/approval-package.md` — human-readable table

Apply consumes ONLY the approval package. Mid-run plan changes are not
visible to apply. Re-run `approve` to refresh the contract.

## Rollback

| module | reversible action |
|--------|-------------------|
| computer/recycled | Windows Recycle Bin → Restore |
| computer/archived | Move file from `disk_audit/archive/<date>/<rel>` back to Downloads |
| gmail/labeled    | Open Gmail → multi-select label → Remove label |
| photos/album-created | Google Photos → delete album (media remains) |

## Hard limits (encoded in code)

- **Computer**: never permadeletes. Recycle-bin or archive-folder only.
- **Gmail**: never sends, never deletes, never archives. Only adds `Cleanup/*` labels.
- **Photos**: never deletes media, never moves media. Only creates new albums.
- **All modules**: apply default = dry-run. `--no-dry-run` is explicit.
- **All modules**: blocked auth never auto-retries past the budget.

## State files

```
organizer/
  state/
    orchestrator.json          # cross-module config + retry budgets
    organizer-state.json       # legacy state (continue-organizer.ps1)
    run-queue.json             # legacy queue
  modules/
    computer/state.json
    gmail/state.json
    photos/state.json
  logs/
    tick.log                   # one line per orchestrator tick
  reports/
    orchestrator-tick.md       # last tick's summary table
```

## Cron payload (proposed, not yet enabled)

`organizer/cron-payload.proposed.json` — mirrors news-dashboard pattern (no `toolsAllow`, model set, narrow `agentTurn` that only invokes `tick.ps1`). Apply only after manual `tick.ps1` runs prove stable for several days.

## Skills

- `_custom/organizer-v2-runbook` — this file
- `_custom/organizer-computer` — Computer module skill
- `_custom/organizer-gmail` — Gmail module skill
- `_custom/organizer-photos` — Photos module skill
- `_custom/organizer-v2` — original orchestrator runbook (kept as overview)
- `_custom/organizer-v2-doctor` — cross-module doctor
- `_custom/cron-guard` — cron loop watchdog
- `_custom/changelog` — entry-format convention

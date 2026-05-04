---
name: organizer-v2
description: Modular Organizer V2 orchestrator — three pipelines (computer, gmail, photos). Computer always runs locally; Gmail and Photos are opt-in modules that require human OAuth. No Docker, no LLM tick calls, retry-budgeted.
---

# organizer-v2

## Topic
Telegram topic 2670 in group `g-elad-clawy`.

## What it is
A pure-local, deterministic orchestrator that runs the three Organizer
pipelines and writes their state. Replaces the failed
`organizer-v2-continuation` cron loop that depended on a Docker sandbox.

## Core principles (encoded in `state/orchestrator.json`)

- **Computer always runs locally.** No auth, no network, just the disk
  audit summary. Ready-for-approval artifacts produced.
- **Gmail and Photos are opt-in.** Default disabled. Re-arm only when a
  human can complete OAuth in the same session.
- **Retry budget.** A blocked module silently increments
  `consecutiveBlockedTicks`. Once it hits its budget
  (`maxBlockedTicksBeforeQuiet`, default 6), it goes `quieted` until
  manually re-armed. No infinite retry loops.
- **No Docker.** All scripts are pure PowerShell + Node.
- **No LLM tick calls.** The tick is deterministic — no language model
  is invoked just to advance state.

## Files

| Path | Role |
|------|------|
| `organizer/state/orchestrator.json` | New top-level config: which modules are enabled, retry budget per module, policy flags. |
| `organizer/state/organizer-state.json` | Per-pipeline status (`ready_for_approval`, `ready`, `blocked_interactive_auth`, etc.). |
| `organizer/state/run-queue.json` | Run queue (used by the older state machine; kept for compatibility). |
| `organizer/scripts/tick.ps1` | New entry point. One tick = run all enabled modules. |
| `organizer/scripts/doctor.js` | Read-only health check. |
| `organizer/scripts/build-computer-report.ps1` | Module: rebuild computer-latest.md from disk_audit. |
| `organizer/scripts/build-computer-approval-packages.ps1` | Module: rebuild computer-approval-packages.md. |
| `organizer/scripts/continue-organizer.ps1` | Legacy state-machine entry point. Kept as a backward-compatible alternative to `tick.ps1`. |
| `organizer/reports/orchestrator-tick.md` | Human-readable summary of the most recent tick. |
| `organizer/logs/tick.log` | One line per tick, append-only. |

## How to run

```powershell
# Tick once (deterministic, ~500ms when computer is "fresh")
powershell -ExecutionPolicy Bypass -File "C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\tick.ps1"

# Health check (~50ms)
node "C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\doctor.js"
```

Exit codes from `tick.ps1`:
- `0` — clean tick
- `2` — at least one enabled module errored
- `3` — every enabled module is in `quieted` state (manual action needed)

## Re-arming a module (Gmail or Photos)

1. Complete the OAuth flow in a real user session (`bootstrap-gmail-auth.ps1`
   or `bootstrap-photos-auth.ps1`).
2. Verify auth via `get-organizer-auth-status.ps1`.
3. Edit `state/orchestrator.json`:
   - set `modules.<name>.enabled` to `true`
   - set `consecutiveBlockedTicks` back to `0`
4. Run a tick to confirm the module advances.
5. Log to `~/.openclaw/CHANGELOG.md` per the `changelog` skill.

## Cron payload (NOT yet enabled)

A new cron payload that mirrors the working `news-dashboard` shape (no
`toolsAllow`, no docker dependency) lives at:

```
organizer/cron-payload.proposed.json
```

Re-enable only after a few manual `tick.ps1` runs confirm the orchestrator
is stable. See that file's comments for the exact diff to apply to
`~/.openclaw/cron/jobs.json`.

## What this does NOT do

- Does NOT execute destructive cleanups. Computer pipeline only produces
  *approval packages* — humans approve before anything is deleted.
- Does NOT submit auth codes on the user's behalf.
- Does NOT touch the news-dashboard system.

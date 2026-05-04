---
name: organizer-v2-doctor
description: One-command read-only health check for the Organizer V2 orchestrator. Reports enabled modules, pipeline statuses, queue state, and recent ticks. Never modifies anything.
---

# organizer-v2-doctor

## Why
Mirror of `news-dashboard-doctor` for the Organizer V2 system. Run before
re-arming a module, before re-enabling the cron, or any time you want to
know "is Organizer healthy and what's it doing right now?"

## How to run

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\doctor.js"
```

Add `--json` for machine output.

## Output

Human (default):
- enabled modules
- per-pipeline status (computer / gmail / photos) and last report path
- queue state (active run, pending, history count, last history outcome)
- recent ticks from `organizer/logs/tick.log` (last 5)
- DOCTOR: OK or DOCTOR: ATTENTION REQUIRED with the issues

Exit codes:
- `0` — healthy
- `2` — attention required (e.g., a module hit its retry budget and is
  now `quieted`)
- non-zero from script error

## What it reads (read-only)

- `organizer/state/orchestrator.json`
- `organizer/state/organizer-state.json`
- `organizer/state/run-queue.json`
- `organizer/logs/tick.log`

It writes nothing. It does not invoke `tick.ps1`. It does not spawn
sub-processes (other than the BOM-safe JSON parsing inside Node).

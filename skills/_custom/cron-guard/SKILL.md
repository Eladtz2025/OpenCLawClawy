---
name: cron-guard
description: Read-only health check on ~/.openclaw/cron/jobs.json. Lists jobs that are currently looping on errors. Never disables anything by itself — surfaces the problem and proposes the fix.
---

# cron-guard

## Why
The "organizer-v2-continuation broke and looped 13 times before being
caught" failure mode must not recur silently. cron-guard runs whenever
Clawy wakes up and any time a cron change is being considered.

## What it checks

For every job in `~/.openclaw/cron/jobs.json`:

- `enabled` flag
- `state.consecutiveErrors`
- `state.lastStatus`, `state.lastRunStatus`
- `state.lastError` (truncated, for context)
- `schedule` (cron expr or every-N-ms)

## How to run

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\skills\_custom\cron-guard\scripts\cron-guard.js"
```

Add `--json` for machine output, otherwise human-readable.

## Output

For each job:

- `OK` — enabled, last run ok, 0 consecutive errors
- `WARN` — enabled, 1–2 consecutive errors (transient or watch)
- `LOOP` — enabled and `consecutiveErrors >= 3` (HARD STOP candidate)
- `DISABLED` — currently disabled (informational)

If any `LOOP` is found, cron-guard prints a one-line proposed fix and
exits with code 2. (OK exits 0, WARN exits 0, DISABLED exits 0.)

## Hard rule

cron-guard never auto-modifies `jobs.json`. It only reports. Disabling a
loop is a separate, approved action (use the `changelog` skill to record
the disable, then edit `jobs.json`).

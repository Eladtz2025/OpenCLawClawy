# Organizer V2

Three-pipeline cleanup system surfacing into Telegram topic 2670.

## Pipelines
- **computer** — local disk-audit driven cleanup proposals. Always runs.
- **gmail**    — opt-in. Requires real-user-session OAuth. Currently DISABLED.
- **photos**   — opt-in. Requires interactive auth code submission. Currently DISABLED.

## Current state (live)
- Driving config: `state/orchestrator.json`
- Per-pipeline status: `state/organizer-state.json`
- Most recent tick summary: `reports/orchestrator-tick.md`

## Entry points

| Verb | Command |
|------|---------|
| Tick (run all enabled modules once) | `powershell -ExecutionPolicy Bypass -File scripts/tick.ps1` |
| Doctor (read-only health snapshot) | `node scripts/doctor.js` |
| Rebuild computer report directly | `powershell -ExecutionPolicy Bypass -File scripts/build-computer-report.ps1` |
| Build computer approval packages | `powershell -ExecutionPolicy Bypass -File scripts/build-computer-approval-packages.ps1` |
| Legacy continuation (kept for compat) | `powershell -ExecutionPolicy Bypass -File scripts/continue-organizer.ps1` |
| Re-arm gmail OAuth | `powershell -ExecutionPolicy Bypass -File scripts/bootstrap-gmail-auth.ps1` (then edit orchestrator.json: gmail.enabled=true) |
| Re-arm photos OAuth | `powershell -ExecutionPolicy Bypass -File scripts/bootstrap-photos-auth.ps1` (then orchestrator.json: photos.enabled=true) |

## Architecture rules

1. **No Docker.** All scripts are pure PowerShell + Node. The cron job that
   used `agentTurn` with `toolsAllow` triggered the OpenClaw sandbox runner
   (which needed Docker) and looped on docker-not-running for 13 cycles
   before being disabled. The new pattern uses a narrow agentTurn that
   only invokes `tick.ps1` and reports.
2. **No LLM tick calls.** `tick.ps1` is deterministic. The LLM is only
   asked to deliver a message when a tick exits non-zero.
3. **Modular and opt-in.** Computer always runs (it has no auth need).
   Gmail and Photos are off-by-default; enable them per-module after a
   real OAuth completes.
4. **Retry budget.** Each module has `maxBlockedTicksBeforeQuiet` (default
   6). After that, the module is `quieted` and stops doing busywork.
5. **Inputs-newer-than-outputs guard.** Computer pipeline only rebuilds
   the report if `disk_audit/filtered_summary.json` is newer than the
   report — no wasted writes.
6. **No deletes.** Every cleanup proposal goes through approval packages
   that the human must sign off on.

## Cron

The previous cron `organizer-v2-continuation` is currently DISABLED in
`~/.openclaw/cron/jobs.json` (set on 2026-05-02). A safer replacement
payload is documented in `cron-payload.proposed.json` and is NOT yet
applied. Apply it only after manual `tick.ps1` runs prove stable.

## Reports surface

| Report | Source | Updated by |
|--------|--------|------------|
| `reports/computer-latest.md`        | `disk_audit/filtered_summary.json` | `build-computer-report.ps1` |
| `reports/computer-approval-packages.md` | `disk_audit/approval_packages.json` etc. | `build-computer-approval-packages.ps1` |
| `reports/gmail-capability-probe.md` | gmail mcporter probe          | `probe-gmail-capabilities.ps1` (manual) |
| `reports/photos-auth-status.md`     | photos auth handshake         | `invoke-photos-auth.ps1` (manual) |
| `reports/orchestrator-tick.md`      | last `tick.ps1` invocation    | `tick.ps1` |
| `reports/continuation-summary.md`   | last `continue-organizer.ps1` | legacy |
| `reports/run-summary.md`            | run history                   | legacy |

## Skills

- `workspace/skills/_custom/organizer-v2/SKILL.md` — full runbook
- `workspace/skills/_custom/organizer-v2-doctor/SKILL.md` — health check

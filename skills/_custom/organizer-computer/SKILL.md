---
name: organizer-computer
description: Computer Health & Optimizer module of Organizer V2. Local Windows scanner that detects large files, old downloads, desktop clutter, temp/cache, duplicates, and produces approval packages. Apply mode is dry-run by default and never permadeletes.
---

# organizer-computer

The "Computer" module of the Organizer V2 suite. Pure-local. No network. No Docker.

## What it scans

Targeted scan (does NOT recurse all of `C:\Users\Itzhak`; that's 600K+ files).
Walks: `Desktop`, `Downloads`, `Documents`, `OneDrive`, `Videos`, `Pictures`, `Music`. Skips `node_modules`, `.git`, `__pycache__`, `AppData`, `.docker`, `.cache`, `.openclaw\agents`, `$Recycle.Bin`.

| Bucket | Source |
|--------|--------|
| Disk usage per drive | `Get-PSDrive` |
| Large user files (>=200MB, top 100) | targeted recursive walk |
| Old downloads (>90 days) | `~/Downloads` only |
| Desktop clutter (non-shortcut) | `~/Desktop` only |
| Temp/cache files (>14 days) | `%LOCALAPPDATA%\Temp`, `C:\Windows\Temp` |
| Duplicate file groups (SHA1 within size buckets) | computed across the above |
| Startup apps | HKCU/HKLM Run keys |
| Installed apps | Uninstall registry keys |
| Process hotspots (top 15 by RAM/CPU) | `Get-Process` |
| Windows health snapshot | OS, uptime, memory, pending reboot heuristic, Defender state |
| Inherited disk_audit (cold/zero/empty) | `disk_audit/filtered_summary.json` |

## Verbs

```powershell
# All commands take an optional -MaxSeconds N (default 90) for the scan budget.
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer scan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer plan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer approve
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer apply         # dry-run by default
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" computer doctor
```

Or call PowerShell directly:

```powershell
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\Itzhak\.openclaw\workspace\organizer\modules\computer\computer.ps1" `
  -Verb scan -MaxSeconds 120
```

## Plan buckets

`plan` classifies scanned items into:

- **safeTrash** — temp/cache files >14d. Apply moves to Windows Recycle Bin (recoverable).
- **archive** — old downloads >90d. Apply moves to `disk_audit/archive/<YYYY-MM-DD>/<rel>`.
- **manualReview** — large user files, duplicate copies, desktop items. Apply NEVER touches these unless `approve -ApproveAll all` (explicit opt-in).

## Approval package

`approve` writes:
- `modules/computer/reports/approval-package.json` (machine-readable, with `contractSha1`)
- `modules/computer/reports/approval-package.md` (human-readable table)

Default approval = `safeTrash + archive` items only. Pass `-ApproveAll all` to also approve the manual-review bucket (use after eyeballing the table).

## Apply

```powershell
# Dry-run (default) — writes apply-log but performs no file ops:
powershell -ExecutionPolicy Bypass -File ".../computer.ps1" -Verb apply

# Real apply (recycle bin only, never permadelete):
powershell -ExecutionPolicy Bypass -File ".../computer.ps1" -Verb apply -NoDryRun
```

The apply log includes per-item `result`: `would-trash-or-archive` (dry-run), `recycled`, `archived`, `requires-manual`, `missing`, `error`.

## Rollback

- `recycled` items: restore from Windows Recycle Bin.
- `archived` items: move back from `disk_audit/archive/<YYYY-MM-DD>/<rel>` to original Downloads location.
- The original `approval-package.json` is preserved; you can re-approve and re-apply.

## State file

`modules/computer/state.json` tracks `lastScanAt`, `lastPlanAt`, `lastApprovalAt`, `lastApprovalSha`, `lastApplyAt`, `lastApplyDryRun`, `lastApplyResult`.

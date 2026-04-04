# Backup Manager

OpenClaw backup manager for this machine.

## Goals

- Full OpenClaw snapshot
- Daily automatic backup
- Keep only the latest 3 snapshots
- Safe restore to a previous known-good state
- Pre-restore safety snapshot before overwrite
- Self-test flow for backup + verify + restore-plan validation

## Scope

The snapshot source is the active OpenClaw state root:

- `C:\Users\Itzhak\.openclaw`

That includes:

- config files
- credentials
- sessions
- workspace
- memory
- tasks
- logs
- devices
- media
- delivery state
- approvals state

Backups are written outside the source tree to:

- `C:\Users\Itzhak\OpenClawBackups`

## Commands

### Create backup

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command backup -Verify
```

### Status

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command status
```

### Health check

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command health-check
```

### List snapshots

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command list
```

### Preview restore plan

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command restore-preview -Snapshot latest
```

### Restore latest snapshot

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command restore -Snapshot latest -Force
```

### Restore specific snapshot

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command restore -Snapshot 2026-04-01T23-40-34.651Z -Force
```

### Install daily schedule

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command install-schedule -DailyAt 03:30
```

### Remove daily schedule

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command uninstall-schedule
```

### Self-test

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command self-test
```

## Safety model

- Health check validates root, backup dir, schedule metadata, retention, latest snapshot verify, restore preview sanity, and manifest presence
- Restore preview shows what will be overwritten, added, or removed before restore
- Restore blocks automatically if preview indicates removals from current state
- Restore warns when snapshot OpenClaw version differs from the current runtime
- Restore requires `-Force`
- Restore creates a fresh `pre-restore` archive first
- Restore extracts to a temp directory first
- Restore validates the archive payload before overwrite
- Each snapshot stores a manifest inventory beside metadata
- Retention pruning happens only after a successful backup write

## Current machine assumptions

This is intentionally tailored to the current machine and active profile:

- Windows
- active state root at `C:\Users\Itzhak\.openclaw`
- OpenClaw CLI available on PATH

## Files

- `backup-manager.ps1` — main manager script
- `schedule.json` — local schedule metadata written after task install

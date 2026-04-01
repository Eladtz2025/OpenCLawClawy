# Backup Manager

OpenClaw backup wrapper for this machine.

## What it does

- Creates full OpenClaw backups using `openclaw backup create`
- Stores them under `C:\Users\Itzhak\OpenClawBackups`
- Keeps only the latest 3 snapshots
- Supports restore from a chosen snapshot
- Creates an automatic pre-restore safety backup before overwrite

## Commands

### Create backup

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command backup -Verify
```

### Show status

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command status
```

### List snapshots

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command list
```

### Prune manually

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command prune
```

### Restore latest snapshot

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command restore -Snapshot latest -Force
```

### Restore specific snapshot

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-manager\backup-manager.ps1 -Command restore -Snapshot 2026-04-01T23-39-38.762Z -Force
```

## Snapshot scope

The underlying OpenClaw backup currently covers the full active state root:

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

## Notes

- Restore is destructive by design and therefore requires `-Force`.
- Restore currently targets this machine layout explicitly: `C:\Users\Itzhak\.openclaw`.
- A pre-restore archive is created under `C:\Users\Itzhak\OpenClawBackups\pre-restore` before files are overwritten.

# Gmail Capability Probe

Generated: 2026-04-27T04:46:00

Status: user_scope_probe_launches_waiting_for_auth

Findings:
- `mcporter` local binary exists
- user-scoped config exists at `C:\Users\Itzhak\.mcporter\mcporter.json`
- user-scoped Google Workspace app data exists at `C:\Users\Itzhak\AppData\Roaming\google-workspace-mcp`
- the Gmail user-scope runner parameter bug was fixed
- live probe now launches and remains waiting for real authenticated user flow

Next executable path:
- `organizer\scripts\invoke-gmail-user-scope.ps1`

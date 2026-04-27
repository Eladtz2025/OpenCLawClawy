# Organizer Auth Next Actions

Generated: 2026-04-27T04:36:00

## Easiest launcher
Run from Elad's real Windows user session:
`C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.cmd`

## PowerShell form
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1`

What it does:
- runs Gmail OAuth step
- runs Google Photos OAuth step
- verifies whether user-scoped Gmail app data exists
- verifies whether `token_photos.pickle` was created
- returns non-zero if either auth flow is still incomplete

## Gmail only
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-gmail-user-scope.ps1 -Tool people.getMe`

## Photos only
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-photos-auth.ps1`

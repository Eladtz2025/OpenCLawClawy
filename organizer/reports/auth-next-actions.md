# Organizer Auth Next Actions

Generated: 2026-04-27T05:16:00

## Check auth state quickly
`C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\get-organizer-auth-status.cmd`

## Easiest launcher
`C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.cmd`

## PowerShell form
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1`

## Complete Photos auth with copied code
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1 -PhotosAuthCode "PASTE_CODE_HERE"`

What the status check reports:
- whether Gmail user-scoped app data exists
- whether Gmail logs directory exists and its last write time
- whether `token_photos.pickle` exists

# Organizer Auth Next Actions

Generated: 2026-04-27T05:06:00

## Easiest launcher
Run from Elad's real Windows user session:
`C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.cmd`

## PowerShell form
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1`

## Complete Photos auth with copied code
After finishing the Google Photos consent screen, rerun with the pasted code:
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1 -PhotosAuthCode "PASTE_CODE_HERE"`

What it does now:
- runs Gmail OAuth step
- verifies Gmail more strictly using user-scoped app data plus fresh log activity
- runs Google Photos OAuth step
- verifies whether `token_photos.pickle` was created
- returns non-zero if either auth flow is still incomplete

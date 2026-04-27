# Organizer Auth Next Actions

Generated: 2026-04-27T04:16:00

## Recommended one-shot command
Run from Elad's real Windows user session:
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\run-organizer-auth-handshake.ps1`

## Gmail only
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-gmail-user-scope.ps1 -Tool people.getMe`

Expected result:
- Google OAuth browser/auth flow under Elad's user profile
- Gmail MCP credentials saved under user scope instead of systemprofile

## Photos only
`powershell -ExecutionPolicy Bypass -File C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-photos-auth.ps1`

Expected result:
- Google OAuth URL appears
- auth code is entered interactively
- `token_photos.pickle` is created

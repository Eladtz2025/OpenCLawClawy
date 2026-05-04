---
name: organizer-photos
description: Photos Cleanup & Organizer module of Organizer V2. Auth-aware Google Photos client. Apply mode performs only album operations — never deletes media, never moves photos out of the user library.
---

# organizer-photos

The "Photos" module of the Organizer V2 suite. Python + google-auth.

## Tooling stack

- Credentials: `~/.openclaw/workspace/credentials.json` (OAuth client)
- Token: `~/.openclaw/workspace/token_photos.pickle` (created on auth)
- Python deps: `google-auth`, `google-auth-oauthlib`, `requests` (already installed)
- Scopes: `photoslibrary.appendonly`, `photoslibrary.readonly.appcreateddata`, `photoslibrary.sharing`

## Important: Google Photos API scope limitation (post-2025)

As of 2025-03-31 Google **restricted** the broad `photoslibrary.readonly`
scope: even when granted, the API returns only data that **this specific
OAuth client created**. The previously-broad-read scope is effectively
gone for new and existing apps; full-library reads now require the
**Picker API** (different UX where the user picks items per session).

What this means for this module:

- `auth` succeeds and writes a valid token. ✓
- `scan` succeeds and queries the API with no errors. ✓
- But `albums.count` and `mediaItems.count` will report **0** unless this
  OAuth client (`openclaw-photos-494514`) has uploaded media or
  created albums. That is the new normal; it's not a bug.
- `apply` (album-create) still works fully — newly-created albums are
  app-created, so they're visible to the app afterwards.

If you want a real library scan in the future, that's a Picker API
integration, which is a separate work item and a different UX.

## Verbs

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" photos auth
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" photos scan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" photos plan
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" photos approve
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" photos apply         # dry-run by default
node "C:\Users\Itzhak\.openclaw\workspace\organizer\orgctl.js" photos doctor
```

## One-time human action: complete OAuth

The OAuth client in `credentials.json` is a **Desktop app** with a single
configured redirect URI of `http://localhost`. Both paths below set
`flow.redirect_uri = 'http://localhost'` to match Google's expectation.

### Path A — `--interactive` (recommended; one command)

This is the easiest. Single command at the keyboard:

```powershell
python "C:\Users\Itzhak\.openclaw\workspace\organizer\modules\photos\photos.py" auth --interactive
```

What happens:
1. Module starts a temporary local HTTP server on a random free port.
2. Opens the consent URL in the default browser.
3. You log in, approve the photoslibrary scopes.
4. Google redirects to `http://localhost:<random-port>/?code=...`.
5. Local server captures the code, completes the exchange, writes
   `token_photos.pickle`.
6. Decision becomes `authenticated_via_interactive`.

After that, edit `organizer/state/orchestrator.json` and set
`modules.photos.enabled = true`.

### Path B — manual code paste (no auto-server)

Use when the machine has no GUI / no browser auto-launch:

1. Run `node ".../orgctl.js" photos auth` once. The full consent URL is
   written to `modules/photos/state/auth-url.txt`. The URL is NOT printed
   to chat in full (it contains a `state` token + PKCE challenge).
2. Open the URL in a browser, log in, approve scopes.
3. Google redirects to `http://localhost/?code=XXXX&...`. The browser
   shows a "site can't be reached" error — this is expected; nothing is
   listening on port 80. Look at the browser address bar and copy the
   `code` parameter (everything between `code=` and the next `&`).
4. Submit it once via:
   ```powershell
   python "C:\Users\Itzhak\.openclaw\workspace\organizer\modules\photos\photos.py" auth --code "PASTE_CODE_HERE"
   ```
   The module reads the persisted PKCE verifier from
   `modules/photos/state/auth-verifier.txt`, uses the same `redirect_uri`,
   completes the exchange, and writes `token_photos.pickle`. The verifier
   is automatically deleted after a successful exchange.
5. Set `modules.photos.enabled = true` in `organizer/state/orchestrator.json`.

## Auth decisions

| decision | meaning |
|---|---|
| `authenticated` | Token loaded and valid. |
| `refreshed` | Expired token refreshed via refresh-token. |
| `authenticated_via_code` | New token freshly created via `--code`. |
| `authenticated_via_interactive` | New token created via `--interactive` (run_local_server). |
| `awaiting_user_consent` | No token yet; consent URL ready. |
| `token_invalid` | Token file present but unusable. |
| `no_credentials_json` | `credentials.json` missing. |
| `deps_missing` | google-auth-* not importable. |

Live scan only runs on the first three. Other states yield `mode=preview-blocked`.

## Scan

Live scan (when authenticated) calls Google Photos API:

| Source | API endpoint |
|---|---|
| Albums (paginated, cap 20 pages × 50) | `GET /v1/albums?pageSize=50` |
| Media items sample (first page) | `POST /v1/mediaItems:search {pageSize:50}` |
| Heuristic groups: screenshots, downloaded/whatsapp, >5y old | derived from sample |

The scan emits **counts and a small sample** only — never the full media list.

## Plan and apply

Plan items (kinds):

| kind | action |
|---|---|
| group-screenshots | create-album-and-add-from-search:Screenshots |
| group-downloaded | create-album-and-add-from-search:Downloaded |
| group-old-pre-2020 | create-album-and-add-from-search:Pre-2020 |
| flag-near-duplicates | mark-only |

Apply path: when `--no-dry-run` and `decision in (authenticated, refreshed, authenticated_via_code)`,
it `POST`s to `/v1/albums` with title `Organizer / <name>` per kind. **No media is moved, copied, deleted, or removed from any album.** The album-add-from-search step is intentionally NOT implemented in this v1 — adding media to an album is left for a future safe expansion once the user reviews proposed scopes.

## Hard rules

- Never delete media.
- Never remove media from existing albums.
- Never modify metadata of media items.
- Apply is dry-run by default; explicit `--no-dry-run` required.

## Rollback

Created albums can be deleted via Google Photos UI (the album metadata only — media remains intact). No data loss.

## Files

- `modules/photos/state.json` — module state
- `modules/photos/state/auth-url.txt` — full consent URL (NOT printed to chat)
- `modules/photos/reports/scan-summary.json` + `scan-report.md`
- `modules/photos/reports/plan.json` + `plan.md`
- `modules/photos/reports/approval-package.json` + `approval-package.md`
- `modules/photos/reports/apply-log.json` + `apply-log.md`
- `modules/photos/logs/module.log`

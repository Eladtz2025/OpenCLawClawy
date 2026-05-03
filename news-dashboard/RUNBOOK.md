# News Dashboard Runbook

## Topic
Telegram topic 106 in group `g-elad-clawy` (id `-1003566973693`).
The 07:30 IL daily-news cron drives this system end-to-end.

## Live URL (verified 200 today)
- Latest:   https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site/latest.html
- Today's:  https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site/YYYY-MM-DD.html

Repo path is **case-sensitive on GitHub Pages**: `OpenCLawClawy`
(uppercase L+C). Earlier debugging used `OpenClawClawy` and got 404 —
that was the bug, not Pages config. Always verify the case in `state.json`.

## Daily flow (driven by `node morning-run.js`)
1. `live-pipeline.js`  — fetch, parse, normalize, dedup, score, select, write `daily-summary.json` + `daily-final.json` + per-topic raw/normalized/deduped/selected JSON.
2. `render-dashboard.js` — bake HTML into `live-site/{TODAY}.html` and `live-site/latest.html` (with redirect).
3. `build-sanity-check.js` — local invariants: buildId match, media references, no corrupted bytes, technology2 has media.
4. `publish-pages.js` — `git add news-dashboard .github/workflows/pages.yml`, commit, push to `origin/main`. Polls public Pages URL for up to 10 min until the new buildId appears.
5. `verify-public-url.js` — curl `publicLatestUrl` → resolve dated redirect → confirm buildId + Hebrew header for today. Writes `telegram-summary.txt` (success) or `telegram-alert.txt` (failure).
6. `verify-media-public.js` — confirms media URLs are accessible.

The cron payload is in `~/.openclaw/cron/jobs.json` (job
`daily-news-dashboard-0730-israel-private`). It only delivers
`telegram-summary.txt`; if `telegram-alert.txt` is non-empty, that gets
sent as a separate alert.

## Status semantics (no fakes)
`live-pipeline.js` decides:
```
SUCCESS = every topic's got >= minGoodCount
PARTIAL = any topic below its min
```
Per-topic rules (`TOPIC_RULES` in `live-pipeline.js`):
| Topic        | targetCount | minGoodCount | maxCount | lowVolume |
|--------------|-------------|--------------|----------|-----------|
| technology   | 5           | 5            | 5        | no        |
| technology2  | 5           | 5            | (none)   | no        |
| israel       | 5           | 5            | 5        | no        |
| crypto       | 5           | 5            | 5        | no        |
| hapoel       | 5           | 1            | 5        | **yes**   |

Hapoel is `lowVolumeByDesign: true` (single small club, not enough
sources for 5 organic items every day). Other topics must hit 5/5 or
the run is PARTIAL.

## Hardening notes (2026-05-02)
- `fetchText` and `fetchBuffer` in `live-pipeline.js` now have a 20s
  timeout via `AbortSignal.timeout`. Override with `NEWS_FETCH_TIMEOUT_MS`.
- `curl.exe` calls in `publish-pages.js` and `verify-public-url.js`
  use `--max-time 30` to prevent silent hangs.
- These edits cannot turn a SUCCESS into a PARTIAL — they only convert
  hangs into clean per-source failures.

## Health check (read-only, ~3s)
```powershell
node "C:\Users\Itzhak\.openclaw\workspace\news-dashboard\doctor.js"
```
Exit 0 = healthy, exit 2 = attention required (with reasons).
Skill spec: `workspace/skills/_custom/news-dashboard-doctor/SKILL.md`.

## Known persistent source failures
These are recognized by `doctor.js` and don't get flagged as new noise:
- `Reuters Tech` — paywalled (HTTP 401), permanent.
- `Kan News` — anti-scraper block (HTTP 403, intermittent).
- `The Block` — anti-scraper block (HTTP 403).
- `SEC Press Releases`, `Blockworks` — parser returns `no_items` (intermittent).
- `Walla Sport`, `Soccerway Hapoel PT`, `ONE Sport`, `Sport 5` —
  intermittent `no_items` for Hapoel topic.

If a source NOT in the known list shows up in `sourcesFailed`,
investigate (parser regression, CDN change, or new block).

## When something breaks
1. `node doctor.js` — first.
2. If `pending Telegram alert`: read `telegram-alert.txt` for the cause.
3. If `live URL serving an older build`: look at the most recent
   `pages-build-deployment` in `gh run list --repo Eladtz2025/OpenCLawClawy`.
4. If `topic X under target`: re-run `node live-pipeline.js` standalone
   (idempotent, doesn't push) and check which sources failed.
5. If a NEW source enters `sourcesFailed`, decide:
   - transient → leave it (will recover)
   - parser broken → fix parser in `live-pipeline.js`
   - source dead → remove from `sources.config.json`
6. To force a fresh publish (rare): just run `node morning-run.js`.

## Publish discipline (from older runbook, still true)
- Treat `live-site/*.html` as public artifacts only after they exist on
  `origin/main` AND the expected URL is reachable AND the buildId
  matches in the body.
- Never send a public Pages link based on local files alone.
- `verify-public-url.js` is what does the real check.

## Files this system writes
Inside `news-dashboard/`:
- `state.json` (run state)
- `daily-final.json` (curated items)
- `daily-summary.json` (per-topic status)
- `*-live.{raw,normalized,deduped,selected}.json` (per-topic stages)
- `telegram-summary.txt`, `telegram-alert.txt` (cron delivery)
- `live-site/{YYYY-MM-DD,latest,index}.html`
- `live-site/archive/{YYYY-MM-DD}.html`
- `live-site/assets/media/*` (images)

Backups outside the publish set:
- `~/.openclaw/workspace/_backups/news-dashboard/*.bak-*`

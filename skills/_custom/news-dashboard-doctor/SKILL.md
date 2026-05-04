---
name: news-dashboard-doctor
description: One-command health check for the daily news dashboard pipeline. Reports build freshness, live URL reachability, per-topic source health, and any pending Telegram alerts. Read-only.
---

# news-dashboard-doctor

## Why
Before changing anything in the news-dashboard pipeline (or before the
07:30 IL cron fires), run the doctor. It tells you in <5 seconds whether
the system is healthy, where the noise is coming from, and what's worth
fixing next.

## What it checks (read-only)

1. **Local state** — `news-dashboard/state.json` exists, has a buildId,
   has a public URL.
2. **Local build freshness** — minutes since `lastPublishedAt`. Flags if
   stale (>30h, the cron should have fired by then).
3. **Daily summary** — overall status (SUCCESS / PARTIAL), per-topic
   `got/minGoodCount`, sources that worked, sources that failed.
4. **Live URL** — curl `state.publicLatestUrl`, expect HTTP 200 and the
   current buildId in the body.
5. **Pending Telegram alert** — if `telegram-alert.txt` is non-empty,
   surface it (means the last cron run flagged a problem).
6. **Per-source persistent failures** — sources that failed in
   `daily-summary.json` and which the doctor knows are persistently
   broken (paywall / 403 / 401).

## How to run

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\news-dashboard\doctor.js"
```

Add `--json` for machine-readable output. Default is human-readable.

Exit codes:
- `0` → healthy
- `2` → degraded (PARTIAL status, or live URL build mismatch, or pending alert)
- `1` → script error / can't read state

## What it does NOT do

- Does not fetch external news sources.
- Does not commit, push, or change any file.
- Does not modify `state.json`, `daily-summary.json`, etc.
- Does not call the editor LLM.

For a real source-level test, run `node live-pipeline.js` (which will
rewrite the daily-summary but NOT publish — publish only happens via
`publish-pages.js` inside `morning-run.js`).

## Hard-coded persistent-failure list

The doctor recognizes these sources as known-problematic so it does not
flag them as new noise. Update this list inside `doctor.js` when a source
permanently dies or comes back.

- `Reuters Tech` — paywall (HTTP 401)
- `Kan News` — anti-scraper block (HTTP 403, intermittent)
- `The Block` — anti-scraper block (HTTP 403)
- `SEC Press Releases` — parser returns no_items (intermittent)
- `Blockworks` — parser returns no_items (intermittent)
- `Walla Sport` / `Soccerway Hapoel PT` / `ONE Sport` / `Sport 5` —
  intermittent no_items for Hapoel topic

If a NON-listed source appears in `sourcesFailed`, the doctor surfaces
it as a "new failure" worth investigating.

# News Engine Runbook

## Official runtime path
- Entry point: `node morning-run.js`
- Main pipeline: `live-pipeline.js`
- Source configuration: `sources.config.json`
- Published dashboard: `live-site/latest.html`
- Archive snapshots: `live-site/archive/YYYY-MM-DD.html`
- Archive index: `live-site/archive/index.html`
- Root redirect: `../index.html`

## Active outputs
- `daily-final.json`
- `daily-summary.json`
- `state.json`
- `telegram-summary.txt`
- `telegram-alert.txt`
- `*-live.raw.json`
- `*-live.normalized.json`
- `*-live.deduped.json`
- `*-live.selected.json`

## Current reality
- The pipeline performs fetch, parse, normalize, dedup, score, select, render, summarize.
- Topic/source definitions are loaded from `sources.config.json`.
- Archive retention currently keeps the latest 7 dated HTML snapshots.
- Dashboard metadata shows worked/failed source counts.
- Hapoel can currently reach 5/5 inside the main pipeline, but still uses internal fixture support rather than a full external fixture adapter.
- Important: local render does not equal public publish. GitHub Pages only updates after an actual git push to the serving branch, so do not send a public Pages link unless remote state is verified.

## Publish discipline
- Treat `index.html` and `news-dashboard/live-site/*.html` as public artifacts only after they exist on `origin/main` (or the configured Pages branch) and the expected URL is reachable.
- Do not send the root Pages URL or dated Pages URL to users based on local files alone.
- If using GitHub Pages, verify remote contents first, then verify the public URL, then share the link.
- If remote publish is not performed, prefer sending a local artifact another way instead of a stale public link.

## Remaining work
- real external fixture-first Hapoel retrieval
- real 7-day fallback for weak days
- richer UI density if desired
- optional cleanup of legacy/docs/debug files outside the runtime path

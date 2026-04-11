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
- The pipeline performs fetch, parse, normalize, dedup, score, select, render, publish, summarize.
- Topic/source definitions are loaded from `sources.config.json`.
- Archive retention currently keeps the latest 7 dated HTML snapshots.
- Dashboard metadata shows worked/failed source counts.
- Hapoel can currently reach 5/5 inside the main pipeline, but still uses internal fixture support rather than a full external fixture adapter.

## Remaining work
- real external fixture-first Hapoel retrieval
- real 7-day fallback for weak days
- richer UI density if desired
- optional cleanup of legacy/docs/debug files outside the runtime path

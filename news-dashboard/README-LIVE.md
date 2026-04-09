# Live News System

Primary runtime:
- `node morning-run.js`
- main pipeline file: `live-pipeline.js`
- published dashboard: `live-site/latest.html`
- published archive: `live-site/archive/YYYY-MM-DD.html`
- public URL: `https://eladtz2025.github.io/OpenCLawClawy/news-dashboard/live-site/latest.html`

What is still kept:
- `*-live.raw.json` / `normalized` / `deduped` / `selected` are run artifacts for QA
- `daily-final.json`, `daily-summary.json`, `state.json`, `telegram-summary.txt` are active outputs

What is legacy and should be removed from the repo/runtime path:
- old `site/` dashboard outputs
- old staged pipeline scripts that are no longer called by `morning-run.js`
- old selected-candidates based files

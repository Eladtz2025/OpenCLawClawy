# Remaining Runtime Gaps

## Still to finish
1. Real external fixture-first Hapoel retrieval path
2. Real 7-day fallback sourcing for crypto/hapoel
3. Richer UI density for categories with 3-5 items
4. Optional Telegram delivery cleanup if this layer becomes production-critical

## Current runtime state
- Main pipeline is active and publishes latest + archive HTML
- Config drift was reduced by loading configured sources from `sources.config.json`
- Candidate schema was aligned with current runtime categories/output
- Archive retention keeps the last 7 dated snapshots and generates `live-site/archive/index.html`
- Dashboard metadata now shows worked/failed source counts at page level and per section

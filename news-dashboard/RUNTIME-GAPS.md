# Remaining Runtime Gaps

## Still to finish
1. Fixture-oriented Hapoel retrieval path
2. Real 7-day fallback sourcing for crypto/hapoel
3. Better Hapoel source depth and verification
4. Stronger per-source failure visibility in UI
5. Richer UI density for categories with 3-5 items

## Current runtime state
- Main pipeline is active and publishes latest + archive HTML
- Config drift was reduced by loading configured sources from `sources.config.json`
- Candidate schema was aligned with current runtime categories/output
- Archive retention now keeps the last 7 dated snapshots and generates `live-site/archive/index.html`

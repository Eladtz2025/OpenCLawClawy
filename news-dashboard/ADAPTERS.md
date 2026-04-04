# Adapter status

## Current state
- source-config layer exists
- collection plan exists
- helper candidate generation exists
- first real-source query map exists

## What is still missing
- actual per-source fetch execution and parsing
- source-specific extraction rules
- semantic dedup across real source results
- fixture-specific adapter for Hapoel
- weekly fallback adapter for crypto/hapoel

## Next implementation target
Use web_search/web_fetch orchestration at runtime, then normalize results into real candidates.

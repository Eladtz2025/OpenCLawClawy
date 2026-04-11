# News Dashboard Cleanup + Hardening Plan

## Scope for this pass
Do only safe, immediate improvements that reduce drift and improve maintainability without changing the product direction.

## Planned changes
1. Make `sources.config.json` the visible source-of-truth for configured sources and align it to the active runtime topics.
2. Align `candidate-schema.json` with the current runtime output, including `technology2` and numeric `score`.
3. Harden `live-pipeline.js` with small structural fixes:
   - read topics from `sources.config.json`
   - keep only last 7 archive HTML files
   - generate archive index page
4. Update runtime docs/status files so they reflect reality instead of stale gaps.
5. Run the pipeline for a real verification pass.

## Explicitly not in scope for this pass
- full fixture-first implementation
- full 7-day fallback implementation
- major UI redesign
- deleting historical docs/files

## Expected outcome
A cleaner single truth path, reduced config drift, 7-day archive retention, archive index generation, and docs that better match the real runtime.

# Hybrid Runtime Contract

## Purpose
Describe exactly how the daily run should behave under the hybrid model.

## Daily run contract
1. Use tools for live collection from approved sources.
2. For each category, scan broadly across the usable source set before choosing stories.
3. From each usable source, attempt to review multiple recent same-day items whenever extraction allows.
4. Build a wide candidate pool first; do not choose final stories early.
5. Normalize outputs into candidate JSON.
6. Run local pipeline scripts:
   - dedup.js
   - score.js
   - select.js
   - fallback.js
   - state-update.js
   - render-app.js
   - archive.js
   - publish.js
7. Commit + push.
8. Notify Elad with the root URL.

## Critical runtime rules
- Do not skip live collection and pretend local helper files are enough.
- Do not pick the final 5 for a category before completing a broad same-day scan across the usable sources for that category.
- Build the pool first, then dedup, verify, and only then choose the top 5.
- Hapoel fixture retrieval should be attempted before leaving category weak.
- Crypto/Hapoel should use weekly fallback when today's pool is weak.
- If a run still has weak retrieval, say so in the page content.

## Honesty rule
Do not describe a layer as live if it is still helper-only.

## UI runtime rule
- Story cards should remain compact.
- The whole card should be the link.
- Do not render a separate visible "קישור" action inside the card.

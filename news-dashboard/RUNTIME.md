# Hybrid Runtime Contract

## Purpose
Describe exactly how the daily run should behave under the hybrid model.

## Daily run contract
1. Use tools for live collection from approved sources.
2. Normalize outputs into candidate JSON.
3. Run local pipeline scripts:
   - dedup.js
   - score.js
   - select.js
   - fallback.js
   - state-update.js
   - render-app.js
   - archive.js
   - publish.js
4. Commit + push.
5. Notify Elad with the root URL.

## Critical runtime rules
- Do not skip live collection and pretend local helper files are enough.
- Hapoel fixture retrieval should be attempted before leaving category weak.
- Crypto/Hapoel should use weekly fallback when today's pool is weak.
- If a run still has weak retrieval, say so in the page content.

## Honesty rule
Do not describe a layer as live if it is still helper-only.

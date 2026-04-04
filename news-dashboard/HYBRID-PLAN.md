# Hybrid News Engine Plan

## Why hybrid
A fully self-contained local JS engine cannot directly call OpenClaw tools like web_search/web_fetch as if they were internal runtime APIs.
So the correct architecture is hybrid:
- OpenClaw tools perform live collection and verification during each run
- Local files/scripts handle state, scoring, selection, rendering, archive, and publishing

## What stays
- POLICY.md
- SOURCES.md
- state.json
- candidate schema
- dedup.js
- score.js
- select.js
- state-update.js
- render-app.js
- archive.js
- publish.js
- site output

## What changes
- JS files should not pretend to fully execute live source retrieval on their own
- collection scripts become planning/helpers, not fake autonomous source engines
- real daily collection is orchestrated by the agent using tools, then normalized into local files

## Real runtime flow
1. Use OpenClaw tools to collect candidate items from approved sources
2. Normalize candidates into local JSON
3. Run dedup.js
4. Run score.js
5. Run select.js
6. Run state-update.js
7. Run render-app.js
8. Run archive.js
9. Run publish.js
10. Commit + push
11. Send short Telegram message with URL

## Feasible promise
This hybrid plan is fully executable with the available tool/runtime model.

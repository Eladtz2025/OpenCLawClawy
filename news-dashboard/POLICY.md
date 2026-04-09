# Daily News Dashboard Policy

## Goal
Produce a high-signal personal daily news dashboard in Hebrew.
The dashboard should behave like a disciplined editorial desk, not a feed.

## Core rule
Prefer missing a weak item over including a mediocre one.

## Fixed source policy

### Technology
Tier 1:
- Reuters Tech
- The Verge
- TechCrunch
- Official company sources (blogs, newsroom, filings, product announcements)

Tier 2:
- User-approved Telegram tech channels (supporting signal only, never sole source)

### Israel
Tier 1:
- הארץ
- ynet
- כאן
- Reuters
- Official government/security statements when relevant

Tier 2:
- Times of Israel as supporting/secondary source

### Crypto
Tier 1:
- Reuters
- CoinDesk
- The Block
- Bloomberg Crypto
- Decrypt
- Primary sources when relevant: SEC, filings, exchange announcements, protocol/foundation statements

### Hapoel Petah Tikva
Tier 1:
- Official club source
- ONE
- Sport5
- Flashscore / Soccerway for fixture verification and today's match status

## Source priority rules
1. Primary source beats commentary.
2. Reuters-level reporting beats secondary aggregation.
3. Telegram channels can surface candidates, but cannot alone justify inclusion.
4. For sports fixtures, use fixture-verification sources before publishing time/date claims.

## Collection pipeline
1. Scan approved usable source set per category.
2. From each usable source, review multiple recent same-day items whenever extraction allows.
3. Build a broad candidate list before any final selection.
4. Remove duplicates.
5. Score each candidate.
6. Verify top candidates.
7. Publish only the strongest items.

## Candidate scoring
Each candidate gets scored on:
- significance
- immediacy
- reliability
- novelty
- usefulness to Elad

Low-scoring items are dropped even if widely covered.

## Hard rejection rules
Reject if any of the following applies:
- rumor only
- price move without real catalyst
- minor product rumor crumb
- opinion piece without new facts
- transfer/sports gossip without strong confirmation
- inflated headline with weak body
- duplicate of stronger source already included

## Verification rules

### Technology
- Prefer company announcement + 1 trusted outlet when possible.
- If only one trusted outlet exists, mark uncertainty honestly.

### Israel
- Sensitive security/policy items require especially careful wording.
- If only partial access exists, say partial verification explicitly.
- Never write as if a deal is done unless clearly confirmed.

### Crypto
- Prefer regulator/filing/exchange/project primary source + 1 trusted outlet.
- Do not publish market chatter as news.

### Hapoel Petah Tikva
- Match / fixture / time claims require fixture verification.
- If there is a match today, it must be included.
- Club decisions require official or very strong sports reporting.
- If today is weak, fall back to strongest items from the last 7 days and label them as weekly fallback.

## Publishing rules
- Scan around 20 candidates per category when feasible
- Target 5 items per category through deeper same-day scanning before concluding the category is thin
- Prefer fewer only after a genuinely broad same-day scan
- For crypto and Hapoel Petah Tikva, if today is weak, fall back to the strongest items from the last 7 days and label them clearly as weekly fallback
- If category is still weak after fallback: write "אין עדכון משמעותי היום"
- Keep headlines plain and factual
- Write short summaries only
- Keep one consistent story across the same day unless new facts justify change

## Consistency rules
- If an item appears earlier in the day, changing it later requires a stronger verified update.
- Do not silently contradict earlier reporting.
- Sports schedule info must remain consistent unless fixture source changed.

## Transparency rules
If verification is partial, say so.
If source access is blocked, say so briefly.
If a category has no strong item, say so cleanly.

## Output philosophy
The dashboard should feel like a personal news app.
It is still a decision-support product, but category-first rather than editor-brief-first.

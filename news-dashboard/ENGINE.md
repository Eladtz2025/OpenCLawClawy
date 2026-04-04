# News Engine Architecture

## Goal
Upgrade the dashboard from prompt-driven summarization into a repeatable news engine.

## Layers

### 1. Source adapters
Per-category source collectors.
Each adapter should know:
- source name
- source type (web, official, telegram, fixture, regulator)
- collection method
- extraction method
- verification strength

Initial adapters:
- Tech: Reuters Tech, The Verge, TechCrunch, official blogs/newsrooms
- Israel: הארץ, ynet, כאן, Reuters, official statements
- Crypto: Reuters, CoinDesk, The Block, Bloomberg Crypto, Decrypt, primary filings/regulators
- Hapoel: official club, ONE, Sport5, Flashscore, Soccerway

### 2. Candidate collection
For each category:
- pull candidate headlines/links/snippets from adapters
- normalize fields
- attach source strength
- attach collectedAt and category

Target:
- ~20 candidates per category when feasible

### 3. Deduplication
Deduplicate by:
- canonical URL if obvious
- semantic similarity in title
- same event across different outlets

Keep strongest source version as primary.
Store alternates for confidence scoring.

### 4. Scoring
Each candidate gets score dimensions:
- significance
- reliability
- novelty
- immediacy
- usefulness to Elad
- category-specific boost

Example category-specific boosts:
- Hapoel match today => very high boost
- crypto filing/regulator => high boost
- Israel security/policy => high significance but strict wording
- official company launch => high reliability

### 5. Verification
Before publishing top items:
- seek second source when needed
- prefer primary source where possible
- mark certainty explicitly
- downgrade or reject if verification thin

### 6. Fallbacks
- Today first
- If weak: last 7 days for crypto and hapoel
- If still weak: no significant update

### 7. State + consistency
Persist lightweight state:
- what was published today
- what changed since prior publish
- prior certainty/status for each story

Use state to avoid:
- silent contradictions
- dropping a story without reason
- rephrasing same story as a different event

### 8. Publishing
Outputs:
- latest.html
- archive/YYYY-MM-DD.html
- archive index of last 7 days

Retention:
- keep last 7 daily archives
- prune older ones

### 9. Telegram delivery
Telegram should receive:
- short message
- fixed latest URL
- optional note if big update since prior publish

## Data model
Each story should carry:
- id
- category
- title
- summary
- why
- source
- sourceUrl
- alternateSources[]
- certainty
- hype
- worth
- action
- score
- collectedAt
- publishedAt
- fallbackMode (today|weekly)

## Execution discipline
- Milestone updates must describe work already done.
- If the text says "next step", it must be followed by actual execution unless blocked.
- Do not narrate planned work as if it already started.

## Build order
1. Source map + policy
2. Candidate JSON per category
3. Dedup + scoring layer
4. State file
5. Archive generation
6. Better site UI
7. Telegram discovery sources

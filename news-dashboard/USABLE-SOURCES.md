# Usable Source Set

## Goal
Maintain a practical source set that works well in this runtime, not just a theoretical source list.

## Technology
Primary usable:
- TechCrunch
- The Verge
- Official company sources
- Ars Technica
- WIRED
- MIT Technology Review
- ZDNet
- Tom's Hardware
- Android Authority
Secondary usable:
- Reuters Tech (search/snippet level when fetch is limited)
Drop/limit rule:
- Keep only sources that return usable search or fetch results in practice
- Engadget is currently weak in extraction
- VentureBeat is currently blocked/rate-limited
- Fast Company is currently blocked
- The Information is currently blocked

## News
Primary usable:
- Reuters (often snippet/search level)
- ynet (search candidate level; direct fetch weak)
- הארץ (search/discovery)
- Jerusalem Post (usable fetch/discovery)
- N12 / mako-news path (usable fetch/discovery)
- Israel Hayom (usable fetch/discovery)
- Walla (usable discovery source)
- Calcalist (usable discovery/fetch)
Secondary usable:
- Times of Israel (search/discovery when accessible)
Drop/limit rule:
- כאן direct fetch currently blocked, so do not rely on it as a primary fetch source in runtime
- Globes is currently too weak in extraction for primary use
- Srugim needs a better tested path before promotion

## Crypto
Primary usable:
- CoinDesk
- Reuters (search/snippet level)
- Decrypt
- SEC / filings / exchange announcements
- DL News (usable fetch/discovery)
- Bitcoin Magazine (usable fallback/discovery)
- Cointelegraph (usable fallback/discovery)
- CNBC Crypto World (usable discovery/fetch)
- CoinSpeaker (usable lower-tier fallback)
Secondary usable:
- Bloomberg Crypto
Drop/limit rule:
- The Block direct fetch currently blocked, so do not rely on it as primary runtime source
- Decrypt is usable and should remain in active rotation
- CryptoSlate is currently too weak/noisy for primary use
- Blockworks is blocked
- CoinGecko News is currently too weak as an editorial source

## Hapoel Petah Tikva
Primary usable target set:
- Official club source
- ONE
- Sport5
- Flashscore
- Soccerway
Secondary candidates tested:
- FotMob (reachable, but extraction quality weak so not primary yet)
- Sofascore (candidate tested but currently forbidden/weak)
- LiveScore (tested path not usable)
- BeSoccer (not usable on tested path)
- AiScore (blocked)
- 365Scores (reachable but extraction too weak)
Current runtime note:
- retrieval quality is still weak; use fixture-first attempts and fallback labeling when weak
- Sofascore did not pass usability in this runtime and should not be primary right now
- FotMob is reachable but currently too weak in extraction to be primary
- 365Scores is reachable but not informative enough to be primary

## Redundancy rule
Each category should aim for:
- 2 strong usable sources minimum
- 1 additional fallback source
- if a source is consistently blocked/weak, downgrade it or remove it from active primary use

# Approved Source Map

## Technology
Primary usable:
- TechCrunch
- The Verge
- Official company blogs / newsrooms / filings
Secondary usable:
- Reuters Tech (search/snippet level when fetch is limited)
- User-approved Telegram tech channels

## Israel
Primary usable:
- Reuters (search/snippet level)
- ynet (search candidate level)
- הארץ (search/discovery)
- Official government/security announcements when relevant
Secondary:
- Times of Israel
Note:
- כאן direct fetch is currently blocked in this runtime, so it should not be a primary fetch dependency.

## Crypto
Primary usable:
- CoinDesk
- Reuters (search/snippet level)
- Decrypt
- SEC / filings / exchange announcements / project statements
Secondary:
- Bloomberg Crypto
Note:
- The Block direct fetch is currently blocked in this runtime, so it should not be a primary fetch dependency.

## Hapoel Petah Tikva
Primary target set:
- Official club source
- ONE
- Sport5
Verification target set:
- Flashscore
- Soccerway
Note:
- Current runtime retrieval is still weak here, so fixture-first attempts and explicit weak-retrieval labeling are required.

## Category fallback
- Crypto: strongest 7-day items if today is weak
- Hapoel Petah Tikva: strongest 7-day items if today is weak
- Hapoel match today: must include when verified

# News Dashboard Next Phase

## New product direction
The dashboard should feel like a personal mobile-first news app.

## UX changes
- Remove "הכי חשוב היום"
- Remove editor summary blocks
- Keep only category-driven experience
- Each category gets its own feed block
- Each category can show up to 5 stories
- Prefer fewer if the day is weak

## Research model
- Scan around 20 candidates per category when feasible
- Deduplicate hard
- Score and verify
- Publish strongest up to 5 per category

## Publishing model
- latest.html = current day
- archive/YYYY-MM-DD.html = dated snapshot
- keep only last 7 days in archive

## Reliability improvements
- cache busting on links
- visible updated timestamp
- more consistent source policy
- stronger sports verification

## Next implementation steps
1. Redesign site UI into app-like category feed
2. Add archive directory handling
3. Add 7-day retention logic
4. Update policy for up-to-5-per-category model
5. Republish latest.html using new structure

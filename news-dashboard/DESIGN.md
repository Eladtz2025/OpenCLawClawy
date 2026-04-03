# Daily News Dashboard V1

## Product goal
A private morning news brief that feels like a compact newsroom product made for one person.

## Core feeling
- Calm
- Sharp
- Premium but not flashy
- Editorial, not social
- Useful in under 2 minutes

## Visual language
- Dark theme
- Strong headline area
- Clear card hierarchy
- Minimal chrome
- RTL-first Hebrew layout
- Few colors, consistent meaning

## Fixed structure
1. Header
   - דשבורד חדשות יומי
   - timestamp
   - מצב היום (short editorial line)
   - metrics: נסרקו / נכנסו / שווים זמן

2. הכי חשוב היום
   - always 3 cards max
   - one-line punch headline
   - 2 short lines of summary
   - tags: category / worth / certainty

3. Category blocks
   - טכנולוגיה
   - ישראל
   - קריפטו
   - הפועל פתח תקווה
   - 0-2 items per category
   - if none: אין עדכון משמעותי היום

4. Editor summary
   - מה הכי חשוב היום
   - מה כנראה מנופח
   - על מה אפשר לדלג

## Card content model
Each news card should contain:
- clean headline
- short summary (2-3 lines)
- why it matters (1 line)
- source label
- certainty
- hype
- worth time
- recommended action

## Tone rules
- Hebrew only
- no hype words unless criticizing hype
- no dramatic verbs unless factually necessary
- no filler
- no duplicate points across sections
- short sentences
- prefer nouns over adjectives

## Editorial rules
- Prefer 5 strong items over 8 average ones
- Never fill empty categories with weak items
- Merge duplicates aggressively
- Price movement alone is not crypto news
- Rumor alone is not tech news
- Routine sports chatter is not Hapoel update
- National security / policy items require cautious wording

## Badge system
### Certainty
- מאומת
- חלקית מאומת
- לא ברור

### Hype
- נמוכה
- בינונית
- גבוהה

### Worth time
- כן
- אולי
- לא

### Recommended action
- לקרוא
- לעקוב
- לדלג

## Telegram output strategy
Primary:
- render visual dashboard image/card
Secondary:
- optional short text below with direct links only if needed

## Rendering constraints
- must be readable on phone
- avoid tiny text
- avoid long paragraphs
- image height should stay reasonable
- if too many items, shorten copy rather than shrinking font

## Daily generation logic
- gather candidates
- dedupe
- score by significance
- cap by category
- write bluntly
- render visually
- send privately

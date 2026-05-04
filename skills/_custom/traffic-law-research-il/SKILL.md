---
name: traffic-law-research-il
description: Research the Israeli traffic statute behind a specific offense — find the regulation/section, number of points, fine tier, applicable appeal route (legacy vs. 2026-02-08 reform), and cite the source. Never invents law; flags `דורש אימות` when not confirmed against an official source.
---

# traffic-law-research-il

חלק מהסוכן `Traffic-Law-Appeal-IL`. תפקידו: לקבל סעיף/תקנה/תיאור
עבירה ולהחזיר ניתוח משפטי קצר עם **ציטוטים מאומתים בלבד**.

## קלט
- `statute` — מתוך הפרסר. למשל "תקנה 54".
- `offenseDescription` — תיאור מילולי מהדו"ח.
- `offenseDate` — תאריך ביצוע (לבדיקה מול רפורמת 2026-02-08).
- `enforcementMethod` (אופציונלי) — שוטר / מצלמה.

## תהליך פעולה

1. **חיפוש בתוך הקבצים המקומיים:**
   - `~/.openclaw/workspace/traffic-law-appeal-il/references/sources.md`
   - `~/.openclaw/workspace/traffic-law-appeal-il/references/points-system.md`
   - `~/.openclaw/workspace/traffic-law-appeal-il/references/2026-reform.md`

2. **אם דרוש אימות חי:** להפעיל `WebFetch` רק על מקורות מ-
   `sources.md`. אסור על דומיינים שלא ברשימה כאלה כסמכות.
   רשימת דומיינים מותרים:
   - gov.il
   - knesset.gov.il
   - main.knesset.gov.il
   - m.knesset.gov.il
   - court.gov.il
   - rsa.gov.il
   - kolzchut.org.il
   - nevo.co.il
   - he.wikisource.org

3. **קלט לא ודאי?** מסמן `דורש אימות` ולא ממציא.

## פלט

```text
### ניתוח משפטי
- **סעיף:** תקנה 54 לתקנות התעבורה, תשכ"א-1961 — מהירות בכביש
  עירוני / בין-עירוני (`דורש אימות` של סעיף-קטן מדויק).
  מקור: <https://he.wikisource.org/wiki/...>
- **קנס:** 250 ₪ — מתאים לטבלת קנסות בצו עבירות תעבורה. (`דורש
  אימות` של מדרגה מדויקת.)
- **נקודות:** 4 נקודות פעילות לתקופה של 2 שנים, לפי משרד התחבורה
  (`דורש אימות`).
- **מסלול ערעור:**
  - עבירה לפני 2026-02-08 → מסלול ישן (מפנ"א + בית משפט שלום
    תעבורה).
  - עבירה ב-2026-02-08 ואילך → לבדוק אם בתוספת ראשונה לחוק הפרות
    תעבורה מינהליות.
  - מקור: references/2026-reform.md
- **מועדים:** 30/90 יום ממסירת הדו"ח. ראה
  references/deadlines.md.
- **הליך פלילי?** במקרה שלך לא — זוהי עבירת קנס. (אם תיאור
  העבירה מצביע על שכרות / תאונה / מהירות מעל הסף הפלילי — לסמן
  והפסק הניתוח, להמליץ על עו"ד.)

### עובדות מסומנות `דורש אימות` (חובה לאמת לפני הגשה)
- מספר הנקודות המדויק לעבירה הספציפית.
- סף קנס במצב עבירה חוזרת.
- האם העבירה ב"תוספת ראשונה" של חוק הפרות תעבורה מינהליות.

### מקורות מצוטטים
- [שם המקור](URL)
- ...
```

## כללי ברזל
1. אסור לצטט מקור שלא ב-`sources.md`.
2. כל ציטוט → URL מלא + שם הסמכות.
3. כל מספר (קנס, נקודות, ימים) שלא אומת → `דורש אימות`.
4. אם העבירה חמורה (פסילה ארוכה, מעל סף פלילי, מעורבות תאונה) —
   לעצור, להציג הזהרה אדומה, ולהמליץ על עו"ד.
5. אסור לצטט פסיקה ספציפית בלי מקור. ואם אין — לכתוב "דורש
   אימות" ולא להמציא שם תיק.

## גבולות
- לא ממליץ על טענה ספציפית — זה תפקיד של
  `traffic-appeal-strategy-il`.
- לא מנסח מכתב — זה תפקיד של `traffic-appeal-letter-drafter-il`.
- לא מתחייב על תוצאה.

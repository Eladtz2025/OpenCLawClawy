---
name: traffic-ticket-parser-il
description: Parse an Israeli traffic ticket (image or text) into a structured record — number, dates, location, statute, fine, points, officer, vehicle, deadline anchor. Hebrew input, Hebrew/JSON output. Marks unknown fields explicitly; never guesses.
---

# traffic-ticket-parser-il

חלק מהסוכן `Traffic-Law-Appeal-IL`. תפקידו אחד: לקבל דו"ח (תמונה /
PDF / טקסט שהמשתמש העתיק) ולהחזיר רשומה מובנית.

## קלט אפשרי
- תמונה / סריקה / צילום מסך של הדו"ח (Read tool רואה תמונות).
- טקסט שאלעד הקליד.
- PDF.
- שילוב.

## פלט
מחזיר טבלה בעברית **וגם** אובייקט JSON, באותו פלט. הסוכן השולח
משתמש ב-JSON להמשך השלבים.

### שדות חובה (אם מופיעים בדו"ח)
- `ticketNumber` — מספר הדו"ח / מספר ההזמנה לדין.
- `issueDate` — תאריך הוצאה (לא הקריטי למועדים).
- `offenseDate` — תאריך ביצוע העבירה.
- `offenseTime` — שעת ביצוע.
- `serviceDate` — `null` אם לא מצוין; הסוכן ישאל את אלעד.
  זה התאריך שממנו רצים מועדי הערעור.
- `location` — כתובת / כביש / ק"מ.
- `offenseDescription` — תיאור מילולי.
- `statute` — סעיף/תקנה/קוד עבירה כפי שמופיע בדו"ח.
- `fineAmount` — קנס בש"ח.
- `points` — נקודות אם מצוין.
- `officer` — שם / מספר שוטר.
- `enforcementMethod` — שוטר / מצלמת מהירות / מצלמת אכיפה / רמזור / אחר.
- `vehicle.plate` — מספר רישוי.
- `vehicle.ownership` — בעלים / שוכר / חברה / לא צוין.
- `deadlineAnchor` — `serviceDate` אם ידוע, אחרת `null`.

### דגלים
- `unknownFields[]` — שדות שלא הצליחו להיקרא.
- `lowConfidenceFields[]` — נקראו אך עם ספק (איכות תמונה ירודה,
  כתב יד לא ברור).

## כללי שפיות
1. **לעולם לא להמציא ערך.** אם השדה לא ברור — `null` ולמלא ב-
   `unknownFields`.
2. **לא להמציא סעיף.** אם רשום "תקנה 54" בלי סעיף קטן, פלט הוא
   "תקנה 54" — לא "תקנה 54(א)".
3. **תאריכים בפורמט מוחלט YYYY-MM-DD.**
4. **קנס במספר טהור (250) ב-`fineAmount`, סטרינג בעברית ("250 ₪")
   ב-`fineAmountHe`.**
5. אם המשתמש הקליד טקסט קצר של "קיבלתי דו"ח על מהירות" — להתייחס
   כקלט לא מספיק, לבקש את התמונה / המספרים.

## פלט לדוגמה (פורמט)

```text
| שדה | ערך |
|---|---|
| מספר דו"ח | 0000-000000-00 |
| תאריך מסירה | 2026-04-25 |
| ... | ... |

JSON:
{
  "ticketNumber": "0000-000000-00",
  "issueDate": "2026-04-13",
  "offenseDate": "2026-04-12",
  "offenseTime": "14:33",
  "serviceDate": "2026-04-25",
  "location": "כביש 4, ק\"מ 84",
  "offenseDescription": "מהירות 92 בקטע 80",
  "statute": "תקנה 54",
  "fineAmount": 250,
  "fineAmountHe": "250 ₪",
  "points": 4,
  "officer": null,
  "enforcementMethod": "מצלמת מהירות נייחת",
  "vehicle": { "plate": "12-345-67", "ownership": "בעלים" },
  "deadlineAnchor": "2026-04-25",
  "unknownFields": ["officer"],
  "lowConfidenceFields": []
}
```

## איך הסוכן משתמש בפלט
- מעביר את `serviceDate` ל-`traffic-deadline-risk-check-il`.
- מעביר את `statute` + `offenseDescription` ל-`traffic-law-research-il`.
- מציג את הטבלה למשתמש לאישור לפני שמסיק מסקנות מעובדות.

## גבולות
- לא מנתח את משמעות המשפטית של העבירה — זה תפקיד של
  `traffic-law-research-il`.
- לא מציע טענות — זה `traffic-appeal-strategy-il`.
- לא קורא צילום OCR לא-עברי / לא-מקצועי בצורה מושלמת. אם איכות
  התמונה ירודה — מסמן `lowConfidenceFields`.

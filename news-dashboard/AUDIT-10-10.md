# Clawy News Dashboard 10/10 Audit

## Goal
להעביר את המערכת ממצב עובד-חלקית ומטולא למערכת יומית קלה, נקייה, יציבה, חד-משמעית, ופרקטית, שבה:
- הדשבורד הוא המוצר הראשי
- טלגרם הוא שכבת התראה קצרה בלבד
- יש מסלול ריצה אחד בלבד
- יש מקור אמת אחד בלבד לכל שלב
- אין קבצי ניסוי, rerun זמניים, או שכבות מקבילות מבלבלות

## Current Reality
המערכת כן עובדת, אבל לא 10/10.
הבעיות המרכזיות הן לא "חוסר יכולת" אלא חוסר ניקיון, פיצול בין שכבות, ושרידים של שלבי ביניים.

## What 10/10 Means Here
מערכת 10/10 צריכה לעמוד בכל אלה:
1. ריצת בוקר אחת, ברורה, קבועה, ואחידה
2. דשבורד אחד בלבד, בעיצוב החדש הרצוי
3. טלגרם שולח רק תקציר קצר + לינק נכון
4. אם יש תקלה, נשלחת רק התראת תקלה קצרה
5. כל קטגוריה נאספת דרך מנגנון קבוע וברור
6. Hapoel הוא multi-source אמיתי, לא תיקון צדדי
7. אין קבצי ביניים לא מחוברים למסלול הראשי
8. אין cron ישן עם payload ישן
9. publish נשען על אותם נתונים שה-summary נשען עליהם
10. אפשר להבין את המערכת תוך כמה דקות בלי ארכיאולוגיה

## Main Gaps To Fix

### 1. No Single Truth Path
כרגע יש יותר מדי שכבות אמת חלקיות:
- `selected-candidates.with-fallback.json`
- `hapoel-multisource-rerun.json`
- `daily-summary.json`
- `site/latest.html`
- `state.json`

צריך לצמצם למסלול אחד:
`collect -> normalize -> select -> render -> publish -> summarize -> notify`

### 2. Hapoel Is Still Not Fully Native In Main Pipeline
Hapoel multi-source הוכח, אבל נשען חלקית על קובץ צדדי:
- `hapoel-multisource-rerun.json`

זה טוב כהוכחת יכולת, אבל לא טוב כמערכת יומית.
צריך להטמיע את Hapoel multi-source בתוך מסלול הבחירה הראשי, בלי rerun מיוחד.

### 3. Telegram Layer Is Not Production-Wired
נוספו קבצי סיכום/התראה:
- `telegram-summary.js`
- `telegram-alert.js`

אבל לפי ההתנהגות בפועל, cron עדיין לא מחובר בצורה נקייה למסלול הזה.

### 4. Legacy Output Still Leaks
עדיין יש payloadים, ניסוחים וקבצים שממשיכים התנהגות מהמערכת הישנה.
זו הסיבה ללינק הישן ולהודעה ארוכה מדי.

### 5. Too Many Intermediate Artifacts
יש יותר מדי קבצים שנשמרו כמוצר קבוע למרות שהם רק שלב ביניים.
זה מגדיל סיכוי לבלבול, drift, ושימוש לא נכון בשכבה הלא נכונה.

## Target Production Architecture

### Single Daily Run
המערכת צריכה לרוץ כל בוקר במסלול יחיד:
1. איסוף מקורות חיים
2. נרמול מועמדים
3. dedup
4. scoring
5. selection
6. render dashboard
7. archive/publish
8. summary generation
9. telegram send
10. failure alert if needed

### Single Core Data Files
רק הקבצים הבאים צריכים להיות קבועים במסלול הראשי:
- `sources.config.json`
- `state.json`
- `selected-candidates.with-fallback.json` או שם נקי יותר כמקור אמת לבחירה הסופית
- `site/latest.html`
- `site/archive/YYYY-MM-DD.html`
- `daily-summary.json`

כל קובץ rerun/fixture/debug שלא נדרש למסלול היומי צריך להימחק או לעבור לאזור `debug/` או `archive-internal/`.

## Required Cleanup

### Delete Or Retire Permanently
אם הם לא מחוברים למסלול היומי הראשי, למחוק או להעביר לארכיון פנימי:
- `hapoel-multisource-rerun.json`
- `rewrite-candidates.js`
- `telegram-summary.txt`
- `telegram-alert.txt`
- קבצי ניסוי חד-פעמיים שלא משרתים את הריצה היומית
- כל artifact שמיוצר זמנית אבל נשאר כקובץ קבוע בלי צורך

### Keep Only If Operationally Required
- `daily-summary.js`
- `telegram-summary.js`
- `telegram-alert.js`
רק אם הם באמת חלק מה-run היומי.
אחרת, לאחד אותם למסקריפט orchestration אחד.

## Required Refactor

### 1. Introduce One Orchestrator
צריך סקריפט אחד ברור, למשל:
- `morning-run.js`

הוא יהיה המסלול הרשמי היחיד של הריצה היומית.
כל cron יריץ רק אותו.

### 2. Make Hapoel Native
צריך שהאיסוף של Hapoel יישען בקוד הראשי על:
- official
- ONE
- Sport5
- ynet sport
- source נוסף רק כשצריך

לא דרך קובץ rerun ידני.

### 3. Short Telegram By Design
הודעת הבוקר צריכה להיות בדיוק:
- בוקר טוב
- סטטוס
- 3 עד 5 כותרות
- שורת fallback/קטגוריה חלשה אם צריך
- לינק נכון

בלי טקסטים ארוכים, בלי פירוט כתבות מלא, בלי שפה עיתונאית.

### 4. Separate Failure Alert Strictly
אם יש כשל מהותי:
- לא להעמיס אותו על הודעת הבוקר הרגילה
- לשלוח התראה נפרדת קצרה בלבד

### 5. Dashboard Metadata Must Reflect Real Run
metadata בדשבורד צריך להגיע רק מה-run האחרון בפועל:
- זמן עדכון אחרון
- האם כל הקטגוריות הושלמו
- האם יש fallback
- כמה מקורות עבדו

לא מחישוב משני לא תואם.

## Production Rules
1. אין payload ישן ב-cron
2. אין לינק ישן בשום שכבת שליחה
3. אין שני מסלולי publish
4. אין קובץ צדדי ל-Hapoel שלא מחובר למסלול הראשי
5. אין placeholder אם יש source אמיתי
6. אין summary שלא משקף את אותם נתונים שה-render משתמש בהם
7. אין קובץ שנשאר רק כי "אולי נצטרך" אם הוא לא חלק מהמערכת

## Exact Definition Of Done
המערכת תיחשב 10/10 רק אם:
- cron אחד בלבד הוא מקור הריצה הרשמי
- cron מריץ orchestrator אחד בלבד
- Hapoel multi-source מובנה במסלול הראשי
- הדשבורד המפורסם הוא הדשבורד החדש הרצוי בלבד
- טלגרם שולח רק תקציר קצר + לינק נכון
- התראת תקלה נשלחת רק כשצריך
- אין קבצי rerun ידניים פעילים
- אין payload ישן פעיל
- כל קובץ שנשאר במערכת הוא נחוץ למסלול הייצורי
- המערכת ניתנת להבנה ותחזוקה בלי שכבות זבל

## Recommended Final File Set
מינימום רצוי:
- `morning-run.js`
- `sources.config.json`
- `state.json`
- `selected-candidates.with-fallback.json` או `final-candidates.json`
- `render-app.js`
- `publish.js`
- `daily-summary.js`
- `telegram-summary.js`
- `telegram-alert.js`
- `site/latest.html`
- `site/archive/...`

כל השאר צריך להישאר רק אם הוא מוכח כנחוץ ל-run הייצורי.

## Next Implementation Direction
השלב הנכון הבא הוא לא עוד שיפור קטן, אלא:
1. hardening של מסלול ריצה אחד
2. חיבור Hapoel multi-source למסלול הראשי
3. תיקון cron לשכבת התראה קצרה בלבד
4. ניקוי קבצים מיותרים לצמיתות

זה מה שצריך כדי להפוך את המערכת ל-10/10 אמיתי ולא רק "מערכת שכבר די עובדת".

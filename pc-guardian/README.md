# PC Guardian

מערכת קלה, שמרנית ויציבה לניטור בריאות המחשב ו-OpenClaw.

## מבנה

- `config/config.json` - thresholds, יעדים, נתיבי dashboard, alerts ו-publish
- `config/rules.json` - allowlists ו-safe policy
- `state/state.json` - מצב ריצה קטן
- `state/last-alert.json` - payload אחרון של התראה + סטטוס שליחה
- `state/fallback-model.json` - מצב fallback פעיל
- `logs/` - לוגים קצרים עם רוטציה
- `dashboard/data.json` - פלט JSON לדשבורד
- `dashboard/index.html` - דשבורד סטטי
- `scripts/run-checks.js` - מנוע בדיקות ותיקונים
- `scripts/render-dashboard.js` - בניית דשבורד סטטי
- `scripts/install-task.ps1` - התקנת Scheduled Task
- `scripts/run-pc-guardian.ps1` - עטיפת הרצה ל-Windows Task Scheduler

## הרצה

`npm run check`

## בדיקת dry-run

`npm test`

## התקנת משימה מתוזמנת

PowerShell כמנהל:

`powershell -ExecutionPolicy Bypass -File .\scripts\install-task.ps1`

ברירת המחדל היא הרצה כל 15 דקות, והסקריפט גם מפעיל את המשימה מיד אחרי ההתקנה.

## Telegram alerts

הגדר ב-`config/config.json`:

- `alerts.telegram.bot_token`
- `alerts.telegram.chat_id`
- `alerts.telegram.silent`

אם השדות ריקים, ההתראות לא יישלחו בפועל.

## Cron jobs

המערכת מנסה קודם `openclaw cron list --json` דרך CLI אמיתי.
אם זה לא זמין, יש fallback לקריאת cache מקומי מתוך `.openclaw/state/gateway-cron-jobs.json`.

## Fallback model

כאשר מזוהות כשלונות model חוזרים, המערכת כותבת `state/fallback-model.json` במצב `config-override` ומציגה זאת בדשבורד.
זה כבר לא marker-only, אבל עדיין דורש צרכן חיצוני שיטען את קובץ ה-state הזה ל-runtime בפועל אם רוצים enforcement מלא.

## Scheduled Task health

המערכת מתייחסת ל-`Ready` ו-`Running` כמצב תקין, ולא מנסה restart מיותר למשימות תקינות.
למשימות OpenClaw יש recovery שמרני בלבד: `schtasks /End` ואז `schtasks /Run`, ורק אם זוהה מצב לא תקין באמת.
אין stop, disable או kill אגרסיבי ל-OpenClaw tasks מתוך המסלול הזה.

## Investigation Subagent layer

נוספה שכבת חקירה משלימה:

- `scripts/investigate-incident.js` - יוצר דוח חקירה מקומי לפי החריגות האחרונות
- `scripts/run-investigation.ps1` - wrapper להרצה בטוחה עם לוג
- `state/investigations/` - ארטיפקטים של דוחות חקירה

כרגע זו שכבת escalation מקומית ושמרנית, לא agent אוטונומי שפועל על המערכת.
היא מיועדת להעמיק רק אחרי זיהוי, לא להחליף את ליבת הניטור.

## Publish dashboard

יש תמיכה ב-2 מצבים דרך `dashboard_publish`:

- `copy` - העתקה לתיקיית יעד
- `git` - העתקה ל-repo נפרד, commit ו-push

כך אין תלות ב-file path מקומי יחיד בצד הצרכן, כל עוד יש יעד publish יציב.

## מדיניות בטיחות

- אין מחיקה אוטומטית של קבצים חשובים, workspace, backups או user folders.
- ניקוי מותר רק בתוך safe cleanup paths, ורק לקבצי temp/log ישנים.
- במצב Critical המערכת מעדיפה stop / restart / disable זמני / alert, ולא מחיקה.
- disable של cron חוזר מתבצע רק אם יש job מתאים, allowlist תואם, ו-OpenClaw CLI זמין.

## GitHub / Pages

הדשבורד הסטטי יושב ב-`dashboard/index.html` וניתן לפרסום ב-GitHub Pages או לכל יעד publish אחר.
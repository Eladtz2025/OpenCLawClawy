# PC Guardian

מערכת קלה, שמרנית ויציבה לניטור בריאות המחשב ו-OpenClaw.

## מבנה

- `config/config.json` - thresholds, יעדים, נתיבי dashboard ו-alerts
- `config/rules.json` - allowlists ו-safe policy
- `state/state.json` - מצב ריצה קטן
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

פתח PowerShell כמנהל והריץ:

`powershell -ExecutionPolicy Bypass -File .\scripts\install-task.ps1`

## עריכת thresholds וכללי auto-fix

- thresholds: `config/config.json`
- allowlists ו-safe cleanup: `config/rules.json`

## מדיניות בטיחות

- אין מחיקה אוטומטית של קבצים חשובים, workspace, backups או user folders.
- ניקוי מותר רק בתוך safe cleanup paths, ורק לקבצי temp/log ישנים.
- במצב Critical המערכת מעדיפה stop / restart / disable זמני / alert, ולא מחיקה.

## GitHub / Pages

הדשבורד הסטטי יושב ב-`dashboard/index.html` וניתן לפרסום ב-GitHub Pages.

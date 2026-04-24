# PC Guardian

מערכת ניטור **reporting-only** למחשב ול-OpenClaw.

המטרה שלה פשוטה: לבדוק, לדווח, לעדכן dashboard, ולשלוח התראות. היא **לא** מתקנת, לא עושה restart, לא מנקה, לא עוצרת תהליכים, ולא משנה cron/jobs על דעת עצמה.

## מה היא עושה

- בודקת CPU, RAM, דיסק, Firewall, Defender ו-Event Viewer
- בודקת reachability לרשת ולאינטרנט
- בודקת gateways, פורטים, tasks ושירותים של OpenClaw
- מעדכנת `state/state.json`
- מייצרת dashboard סטטי ב-`dashboard/index.html`
- מעתיקה את ה-dashboard ליעד publish אם הוגדר
- שולחת התראות לטלגרם רק על חריגות עם משמעות תפעולית

## מה היא לא עושה

- לא מבצעת auto-fix
- לא עושה restart לשירותים או tasks
- לא עושה kill לתהליכים
- לא מנקה קבצים או temp
- לא משנה cron jobs
- לא מחליפה models

אם תרצה שמערכת תבצע פעולה, זה צריך להיות מפורש ונפרד מהניטור.

## מבנה

- `config/config.json` - קונפיג ראשי
- `config/rules.json` - חוקים וסיווגים
- `config/secrets.example.json` - תבנית לסודות
- `config/secrets.local.json` - סודות מקומיים לא ב-git
- `state/state.json` - מצב ריצה אחרון
- `state/last-alert.json` - ההתראה האחרונה שנשלחה
- `logs/` - לוגים קצרים
- `dashboard/data.json` - פלט JSON לדשבורד
- `dashboard/index.html` - דשבורד סטטי
- `scripts/validate-config.js` - ולידציית קונפיג
- `scripts/run-checks.js` - מנוע הבדיקות
- `scripts/render-dashboard.js` - בניית הדשבורד
- `scripts/install-task.ps1` - התקנת Scheduled Task
- `scripts/run-pc-guardian.ps1` - wrapper להרצה מתוזמנת

## הרצה

```powershell
node .\scripts\validate-config.js
node .\scripts\run-checks.js
```

או:

```powershell
npm run check
```

## בדיקת dry-run

```powershell
npm test
```

## סודות

כדי לא לשמור token בתוך `config.json`, שים את פרטי הטלגרם ב-`config/secrets.local.json` לפי `config/secrets.example.json`.

אפשר גם דרך environment variables:

- `PC_GUARDIAN_TELEGRAM_BOT_TOKEN`
- `PC_GUARDIAN_TELEGRAM_CHAT_ID`

## התקנת משימה מתוזמנת

PowerShell כמנהל:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-task.ps1
```

ברירת המחדל היא כל 120 דקות.

## עקרונות סיווג

- יעדי אינטרנט משניים יכולים להישאר בדשבורד כ-Info בלי לשלוח התראה
- `cron unavailable` מוצג כמידע, לא כתקלה קריטית
- אם gateway נפל וגם הפורט שלו חסר, הדגש הוא על ה-gateway ולא על שכפול רעש

## מצב המוצר

המערכת מיועדת להיות:

- שקטה
- שמרנית
- קריאה
- ללא פעולות אוטומטיות
- קלה להבנה ול-debug

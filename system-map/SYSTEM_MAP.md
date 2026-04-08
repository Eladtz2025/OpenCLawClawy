# SYSTEM_MAP

מיפוי, ביקורת ודירוג שמרני של מערכות OpenClaw והמערכות הקשורות שנמצאו תחת Itzhak ו-Openclaw. הסריקה הייתה לקריאה בלבד.

## תמונת מצב

- נמצאו 2 רנטיימים פעילים של OpenClaw, אחד לכל יוזר.
- נמצאו 2 Scheduled Tasks פעילים לשירותי Gateway ועוד משימת reconnect כללית.
- נמצאו פורטי Dashboard/Gateway פעילים: 18789, 18790, עם פורטים משויכים נוספים 18791, 18792.
- נמצאו שאריות קונפיג רבות: קבצי bak/clobbered בשני היוזרים.
- נמצאו פרויקטים מותאמים אישית ב-workspace של Itzhak שדורשים סיווג ידני בין active ל-residue.

## OpenClaw Itzhak Main

- ייעוד: Primary OpenClaw runtime for Itzhak with Telegram access and local dashboard.
- בעלות: Itzhak
- מצב: active
- איפה יושב: C:\Users\Itzhak\.openclaw\workspace
- ממה מורכב: gateway, telegram channel, browser tooling, cron store, workspace, memory store
- מה קשור: configs: C:\Users\Itzhak\.openclaw\openclaw.json, C:\ProgramData\OpenClaw\openclaw-Itzhak.cmd | tasks: OpenClaw - On Network Reconnect, OpenClaw Gateway - Itzhak | ports: 18789, 18791, 58697 | files: C:\ProgramData\OpenClaw\openclaw-Itzhak.cmd, C:\Users\Itzhak\AppData\Roaming\npm\node_modules\openclaw\dist\index.js
- שאריות/כפילויות: multiple openclaw.json.clobbered backups; config backup chain (.bak*); possible stale logs/backups
- נדרשת בדיקה ידנית: כן - Security posture is open groupPolicy with full exec and elevated tools.
- ציון כללי: 5.7/10 (weak)
- משקל על המחשב הזה: moderate
- הערכה: בנויה acceptable, מסורבלת מדי: לא, כבדה מדי: לא, רועשת מדי: לא, משאירה residue: כן, צריכה refactor: כן, מתאימה למחשב: yes
- המלצה: improve later
- הערת ביקורת: רץ בפועל ונראה יציב, אבל החשיפה לקבוצת טלגרם פתוחה עם exec מלא פוגעת קשות בבטיחות ובתחזוקתיות.

## OpenClaw Openclaw Main

- ייעוד: Secondary OpenClaw runtime for Openclaw user with its own Telegram bot and local dashboard.
- בעלות: Openclaw
- מצב: active
- איפה יושב: C:\Users\OpenClaw\.openclaw\workspace
- ממה מורכב: gateway, telegram channel, browser tooling, workspace, memory store
- מה קשור: configs: C:\Users\Openclaw\.openclaw\openclaw.json, C:\ProgramData\OpenClaw\openclaw-Openclaw.cmd | tasks: OpenClaw - On Network Reconnect, OpenClaw Gateway - Itzhak, OpenClaw Gateway - Openclaw | ports: 18790, 18792, 57849 | files: C:\ProgramData\OpenClaw\openclaw-Openclaw.cmd, C:\Users\Openclaw\AppData\Roaming\npm\node_modules\openclaw\dist\index.js
- שאריות/כפילויות: multiple openclaw.json.clobbered backups; config backup chain (.bak*)
- נדרשת בדיקה ידנית: כן - Fallback model gemma4:e2b may require manual validation, and groupPolicy is open with full exec.
- ציון כללי: 5.4/10 (weak)
- משקל על המחשב הזה: moderate
- הערכה: בנויה acceptable, מסורבלת מדי: לא, כבדה מדי: לא, רועשת מדי: לא, משאירה residue: כן, צריכה refactor: כן, מתאימה למחשב: yes
- המלצה: manual review
- הערת ביקורת: גם כאן הריצה פעילה, אבל יש חוסר בהירות סביב fallback model וחשיפת exec מלאה בקבוצות.

## Workspace Custom Systems Cluster

- ייעוד: Collection of custom-built systems found in the Itzhak OpenClaw workspace.
- בעלות: Itzhak
- מצב: unknown
- איפה יושב: C:\Users\Itzhak\.openclaw\workspace
- ממה מורכב: news-dashboard, image-team, backup-manager residue, smoke-test-build
- מה קשור: files: C:\Users\Itzhak\.openclaw\workspace\image-team, C:\Users\Itzhak\.openclaw\workspace\news-dashboard, C:\Users\Itzhak\.openclaw\workspace\smoke-test-build
- שאריות/כפילויות: deleted backup-manager tracked files in git status; deleted image-team run artifacts in git status; multiple experimental folders
- נדרשת בדיקה ידנית: כן - Requires owner review to separate active projects from residue.
- ציון כללי: 4/10 (weak)
- משקל על המחשב הזה: heavy
- הערכה: בנויה weak, מסורבלת מדי: כן, כבדה מדי: כן, רועשת מדי: כן, משאירה residue: כן, צריכה refactor: כן, מתאימה למחשב: partial
- המלצה: needs cleanup
- הערת ביקורת: זה אוסף פרויקטים ולא מערכת אחת נקייה. יש שאריות ב-git status וחוסר הפרדה ברור בין פעיל, ניסיוני ונטוש.

## Residue וסיכוני תחזוקה

- wrappers פעילים: C:\ProgramData\OpenClaw\openclaw-Itzhak.cmd, C:\ProgramData\OpenClaw\openclaw-Openclaw.cmd
- wrappers/refs ישנים אפשריים: OpenClaw - On Network Reconnect, backup-manager, smoke-test-build, image-team/runs שנמחקו ב-git status
- stale logs: commands.log וקבצי logs נוספים דורשים מדיניות רוטציה ידנית אם רוצים לצמצם משקל מקומי.
- stale model refs: ב-Openclaw מוגדר fallback gemma4:e2b, לא אומת כמודל זמין רץ כעת.
- stale backups refs: קיימים snapshotים רבים מסוג .bak ו-.clobbered בשני היוזרים.

## קבצי פלט

- C:\Users\Itzhak\.openclaw\workspace\system-map\SYSTEM_MAP.md
- C:\Users\Itzhak\.openclaw\workspace\system-map\systems.json
- C:\Users\Itzhak\.openclaw\workspace\system-map\systems_review.json
- C:\Users\Itzhak\.openclaw\workspace\system-map\dashboard-data.json
# SYSTEM_MAP

מיפוי, ביקורת ודירוג שמרני של מערכות OpenClaw והמערכות הקשורות שנמצאו תחת Itzhak ו-Openclaw. הסריקה הייתה לקריאה בלבד.

## תמונת מצב

- מערכות שזוהו: 3
- מערכות כבדות: 1
- מערכות שדורשות ניקוי: 3
- מערכות קרובות ל-10/10: 0

## Itzhak Main Runtime

- purpose: Primary OpenClaw runtime for Itzhak with Telegram and local dashboard.
- owner: Itzhak
- status: active
- overall_score: 5.7/10 (weak)
- weight: moderate
- recommendation: improve later
- needs_cleanup: yes
- needs_redesign: no
- last_checked: 2026-04-08T11:02:34.092Z
- last_updated_if_known: 2026-04-07T15:28:45.140Z
- dashboard_link_if_exists: https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html
- workspace_path: C:\Users\Itzhak\.openclaw\workspace
- key_risks: open telegram groupPolicy, full exec exposure, many config backup snapshots
- short_summary: טוב תפעולית, חלש בבטיחות ובניקיון קונפיג.
- score_explanations: architecture=מבנה סביר, אבל רמת החשיפה גבוהה מדי.; clarity=המערכת מובנת חלקית, אך לא מספיק מבודדת.; safety=הבטיחות חלשה בגלל exec מלא בקבוצה פתוחה.

## Openclaw Main Runtime

- purpose: Secondary OpenClaw runtime for Openclaw user with Telegram and local dashboard.
- owner: Openclaw
- status: active
- overall_score: 5.4/10 (weak)
- weight: moderate
- recommendation: manual review
- needs_cleanup: yes
- needs_redesign: no
- last_checked: 2026-04-08T11:02:34.092Z
- last_updated_if_known: 2026-04-07T13:34:35.928Z
- dashboard_link_if_exists: https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html
- workspace_path: C:\Users\OpenClaw\.openclaw\workspace
- key_risks: open telegram groupPolicy, full exec exposure, fallback model not verified
- short_summary: שימושי, אבל לא מספיק מהודק ולא מספיק בטוח.
- score_explanations: architecture=מבנה בסיסי תקין, אך יש חוסר בהירות סביב fallback.; clarity=הקריאות ניהולית בינונית.; safety=חשיפה בטיחותית גבוהה.

## Custom Workspace Cluster

- purpose: Mixed custom systems found in the Itzhak workspace.
- owner: Itzhak
- status: unknown
- overall_score: 4/10 (weak)
- weight: heavy
- recommendation: needs cleanup
- needs_cleanup: yes
- needs_redesign: yes
- last_checked: 2026-04-08T11:02:34.092Z
- last_updated_if_known: unknown
- dashboard_link_if_exists: unknown
- workspace_path: C:\Users\Itzhak\.openclaw\workspace
- key_risks: mixed active and stale projects, git residue, unclear ownership by subproject
- short_summary: מעורבב מדי, כבד מדי, ולא מספיק ניהולי.
- score_explanations: architecture=זה לא ארכיטקטורה אחת ברורה אלא צבר פרויקטים.; clarity=הבהירות נמוכה.; safety=לא זוהתה חשיפה כמו ברנטיימים, לכן מעט טוב יותר.

## Output Files

- C:\Users\Itzhak\.openclaw\workspace\system-map\SYSTEM_MAP.md
- C:\Users\Itzhak\.openclaw\workspace\system-map\systems.json
- C:\Users\Itzhak\.openclaw\workspace\system-map\systems_review.json
- C:\Users\Itzhak\.openclaw\workspace\system-map\dashboard-data.json
- C:\Users\Itzhak\.openclaw\workspace\system-map\dashboard.html
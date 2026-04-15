import json
from pathlib import Path
from datetime import datetime, timezone

workspace = Path(r'C:\Users\Itzhak\.openclaw\workspace')
output_dir = workspace / 'system-map'
output_dir.mkdir(exist_ok=True)

def load_json(path):
    p = Path(path)
    if not p.exists():
        return None
    text = p.read_text(encoding='utf-8-sig', errors='ignore').strip()
    if not text:
        return None
    return json.loads(text)

itzhak_cfg = load_json(r'C:\Users\Itzhak\.openclaw\openclaw.json') or {}
openclaw_cfg = load_json(r'C:\Users\Openclaw\.openclaw\openclaw.json') or {}
cron = load_json(workspace / 'SYSTEM_MAP_DATA' / 'cron.json') or []
workspaces = load_json(workspace / 'SYSTEM_MAP_DATA' / 'workspaces.json') or []
logs = load_json(workspace / 'SYSTEM_MAP_DATA' / 'logs.json') or []
agents = load_json(workspace / 'SYSTEM_MAP_DATA' / 'agents.json') or []
tasks = load_json(workspace / 'SYSTEM_MAP_DATA' / 'scheduled_tasks.json') or []
processes = load_json(workspace / 'SYSTEM_MAP_DATA' / 'processes.json') or []
ports = load_json(workspace / 'SYSTEM_MAP_DATA' / 'ports.json') or []

if isinstance(cron, dict): cron = [cron]
if isinstance(workspaces, dict): workspaces = [workspaces]
if isinstance(logs, dict): logs = [logs]
if isinstance(agents, dict): agents = [agents]
if isinstance(tasks, dict): tasks = [tasks]
if isinstance(processes, dict): processes = [processes]
if isinstance(ports, dict): ports = [ports]

proc_by_pid = {p.get('ProcessId'): p for p in processes if isinstance(p, dict)}
ports_by_pid = {}
for p in ports:
    if not isinstance(p, dict):
        continue
    ports_by_pid.setdefault(p.get('OwningProcess'), []).append(p.get('LocalPort'))

log_paths = [x.get('FullName') for x in logs if isinstance(x, dict)]
cron_paths = [x.get('FullName') for x in cron if isinstance(x, dict)]
workspace_paths = [x.get('FullName') for x in workspaces if isinstance(x, dict)]
agent_paths = [x.get('FullName') for x in agents if isinstance(x, dict)]

def iso_to_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    except Exception:
        return s

systems = []

def add_system(system):
    systems.append(system)

itzhak_pid = None
openclaw_pid = None
for p in processes:
    cmd = (p.get('CommandLine') or '').lower()
    if 'openclaw\\dist\\index.js" gateway --port 18789' in cmd or 'gateway --port 18789' in cmd:
        itzhak_pid = p.get('ProcessId')
    if 'openclaw\\dist\\index.js" gateway --port 18790' in cmd or 'gateway --port 18790' in cmd:
        openclaw_pid = p.get('ProcessId')

open_tasks = [t for t in tasks if isinstance(t, dict) and 'OpenClaw' in (t.get('TaskName') or '')]

add_system({
    'system_id': 'openclaw-itzhak-main',
    'name': 'OpenClaw Itzhak Main',
    'user_owner': 'Itzhak',
    'purpose': 'Primary OpenClaw runtime for Itzhak with Telegram access and local dashboard.',
    'input_channels': ['telegram'],
    'output_channels': ['telegram', 'dashboard'],
    'bot_topic_group': {'telegram_group_policy': itzhak_cfg.get('channels', {}).get('telegram', {}).get('groupPolicy'), 'telegram_require_mention': itzhak_cfg.get('channels', {}).get('telegram', {}).get('groups', {}).get('*', {}).get('requireMention')},
    'related_workspace_path': itzhak_cfg.get('agents', {}).get('defaults', {}).get('workspace'),
    'related_config_paths': [r'C:\Users\Itzhak\.openclaw\openclaw.json', r'C:\ProgramData\OpenClaw\openclaw-Itzhak.cmd'],
    'related_scripts_files': [r'C:\ProgramData\OpenClaw\openclaw-Itzhak.cmd', r'C:\Users\Itzhak\AppData\Roaming\npm\node_modules\openclaw\dist\index.js'],
    'related_scheduled_tasks': [t.get('TaskName') for t in open_tasks if 'Itzhak' in (t.get('TaskName') or '') or 'On Network Reconnect' in (t.get('TaskName') or '')],
    'related_cron_jobs': [p for p in cron_paths if p and p.startswith(r'C:\Users\Itzhak\.openclaw\cron')],
    'related_ports': sorted(set((ports_by_pid.get(itzhak_pid) or []) + [18789, 18791])),
    'dependencies': ['Node.js', 'OpenAI Codex', 'Ollama', 'Telegram Bot API', 'browser plugin'],
    'browser_used': bool(itzhak_cfg.get('browser', {}).get('enabled')),
    'telegram_used': True,
    'whatsapp_used': False,
    'model_fallback_exists': bool(itzhak_cfg.get('agents', {}).get('defaults', {}).get('model', {}).get('fallbacks')),
    'status': 'active',
    'last_known_activity': iso_to_date(itzhak_cfg.get('meta', {}).get('lastTouchedAt')),
    'risk_level': 'high',
    'estimated_weight': 'moderate',
    'components': ['gateway', 'telegram channel', 'browser tooling', 'cron store', 'workspace', 'memory store'],
    'residue_or_duplicates': ['multiple openclaw.json.clobbered backups', 'config backup chain (.bak*)', 'possible stale logs/backups'],
    'manual_check_required': True,
    'manual_check_reason': 'Security posture is open groupPolicy with full exec and elevated tools.'
})

add_system({
    'system_id': 'openclaw-openclaw-main',
    'name': 'OpenClaw Openclaw Main',
    'user_owner': 'Openclaw',
    'purpose': 'Secondary OpenClaw runtime for Openclaw user with its own Telegram bot and local dashboard.',
    'input_channels': ['telegram'],
    'output_channels': ['telegram', 'dashboard'],
    'bot_topic_group': {'telegram_group_policy': openclaw_cfg.get('channels', {}).get('telegram', {}).get('groupPolicy'), 'telegram_require_mention': openclaw_cfg.get('channels', {}).get('telegram', {}).get('groups', {}).get('*', {}).get('requireMention')},
    'related_workspace_path': openclaw_cfg.get('agents', {}).get('defaults', {}).get('workspace'),
    'related_config_paths': [r'C:\Users\Openclaw\.openclaw\openclaw.json', r'C:\ProgramData\OpenClaw\openclaw-Openclaw.cmd'],
    'related_scripts_files': [r'C:\ProgramData\OpenClaw\openclaw-Openclaw.cmd', r'C:\Users\Openclaw\AppData\Roaming\npm\node_modules\openclaw\dist\index.js'],
    'related_scheduled_tasks': [t.get('TaskName') for t in open_tasks if 'Openclaw' in (t.get('TaskName') or '') or 'On Network Reconnect' in (t.get('TaskName') or '')],
    'related_cron_jobs': [p for p in cron_paths if p and p.startswith(r'C:\Users\Openclaw\.openclaw\cron')],
    'related_ports': sorted(set((ports_by_pid.get(openclaw_pid) or []) + [18790, 18792])),
    'dependencies': ['Node.js', 'OpenAI Codex', 'Ollama fallback', 'Telegram Bot API', 'browser plugin'],
    'browser_used': bool(openclaw_cfg.get('browser', {}).get('enabled')),
    'telegram_used': True,
    'whatsapp_used': False,
    'model_fallback_exists': bool(openclaw_cfg.get('agents', {}).get('defaults', {}).get('model', {}).get('fallbacks')),
    'status': 'active',
    'last_known_activity': iso_to_date(openclaw_cfg.get('meta', {}).get('lastTouchedAt')),
    'risk_level': 'high',
    'estimated_weight': 'moderate',
    'components': ['gateway', 'telegram channel', 'browser tooling', 'workspace', 'memory store'],
    'residue_or_duplicates': ['multiple openclaw.json.clobbered backups', 'config backup chain (.bak*)'],
    'manual_check_required': True,
    'manual_check_reason': 'Fallback model gemma4:e2b may require manual validation, and groupPolicy is open with full exec.'
})

custom_workspace_hits = [p for p in workspace_paths if p and any(k in p.lower() for k in ['news-dashboard', 'image-team', 'backup-manager', 'smoke-test-build'])]
add_system({
    'system_id': 'workspace-custom-systems',
    'name': 'Workspace Custom Systems Cluster',
    'user_owner': 'Itzhak',
    'purpose': 'Collection of custom-built systems found in the Itzhak OpenClaw workspace.',
    'input_channels': ['file-based', 'possibly telegram for news-dashboard'],
    'output_channels': ['files', 'possible telegram artifacts'],
    'bot_topic_group': {},
    'related_workspace_path': r'C:\Users\Itzhak\.openclaw\workspace',
    'related_config_paths': [],
    'related_scripts_files': custom_workspace_hits,
    'related_scheduled_tasks': [],
    'related_cron_jobs': [],
    'related_ports': [],
    'dependencies': ['workspace files', 'project-specific scripts'],
    'browser_used': False,
    'telegram_used': True,
    'whatsapp_used': False,
    'model_fallback_exists': False,
    'status': 'unknown',
    'last_known_activity': None,
    'risk_level': 'medium',
    'estimated_weight': 'heavy',
    'components': ['news-dashboard', 'image-team', 'backup-manager residue', 'smoke-test-build'],
    'residue_or_duplicates': ['deleted backup-manager tracked files in git status', 'deleted image-team run artifacts in git status', 'multiple experimental folders'],
    'manual_check_required': True,
    'manual_check_reason': 'Requires owner review to separate active projects from residue.'
})

residue = {
    'stale_backups': [p for p in [r'C:\Users\Itzhak\.openclaw', r'C:\Users\Openclaw\.openclaw'] for _ in [0]],
    'config_backup_indicators': [
        'Itzhak: openclaw.json.bak, .bak.1-.bak.4, multiple .clobbered snapshots',
        'Openclaw: openclaw.json.bak, .bak.1-.bak.4, multiple .clobbered snapshots'
    ],
    'stale_or_missing_model_refs': [
        'Openclaw fallback model ollama/gemma4:e2b not confirmed in running Ollama process list',
    ],
    'stale_tasks': [t.get('TaskName') for t in open_tasks if t.get('State') != 4],
    'stale_logs_candidates': [p for p in log_paths if p and ('commands.log' in p or 'audit' in p.lower())][:20],
    'old_workspaces_or_wrappers': [p for p in custom_workspace_hits if p and any(k in p.lower() for k in ['backup-manager', 'smoke-test-build'])]
}

systems_json = {
    'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    'scan_scope': [r'C:\Users\Itzhak', r'C:\Users\Openclaw'],
    'systems': systems,
    'residue_summary': residue
}

(output_dir / 'systems.json').write_text(json.dumps(systems_json, ensure_ascii=False, indent=2), encoding='utf-8')
(output_dir / 'dashboard-data.json').write_text(json.dumps({'systems': [{'system_id': s['system_id'], 'name': s['name'], 'status': s['status'], 'risk_level': s['risk_level'], 'owner': s['user_owner']} for s in systems]}, ensure_ascii=False, indent=2), encoding='utf-8')

lines = []
lines.append('# SYSTEM_MAP')
lines.append('')
lines.append('מיפוי תמציתי של מערכות OpenClaw והמערכות הקשורות שנמצאו תחת Itzhak ו-Openclaw. הסריקה הייתה לקריאה בלבד.')
lines.append('')
lines.append('## תמונת מצב')
lines.append('')
lines.append('- נמצאו 2 רנטיימים פעילים של OpenClaw, אחד לכל יוזר.')
lines.append('- נמצאו 2 Scheduled Tasks פעילים לשירותי Gateway ועוד משימת reconnect כללית.')
lines.append('- נמצאו פורטי Dashboard/Gateway פעילים: 18789, 18790, עם פורטים משויכים נוספים 18791, 18792.')
lines.append('- נמצאו שאריות קונפיג רבות: קבצי bak/clobbered בשני היוזרים.')
lines.append('- נמצאו פרויקטים מותאמים אישית ב-workspace של Itzhak שדורשים סיווג ידני בין active ל-residue.')
lines.append('')
for s in systems:
    lines.append(f"## {s['name']}")
    lines.append('')
    lines.append(f"- ייעוד: {s['purpose']}")
    lines.append(f"- בעלות: {s['user_owner']}")
    lines.append(f"- מצב: {s['status']}")
    lines.append(f"- איפה יושב: {s['related_workspace_path'] or 'לא זוהה'}")
    lines.append(f"- ממה מורכב: {', '.join(s['components'])}")
    related = []
    if s['related_config_paths']:
        related.append('configs: ' + ', '.join(s['related_config_paths']))
    if s['related_scheduled_tasks']:
        related.append('tasks: ' + ', '.join(s['related_scheduled_tasks']))
    if s['related_ports']:
        related.append('ports: ' + ', '.join(map(str, s['related_ports'])))
    if s['related_scripts_files']:
        related.append('files: ' + ', '.join(s['related_scripts_files'][:6]))
    lines.append(f"- מה קשור: {' | '.join(related) if related else 'לא זוהו קישורים נוספים מעבר לברירת המחדל'}")
    residue_text = '; '.join(s['residue_or_duplicates']) if s['residue_or_duplicates'] else 'לא זוהו'
    lines.append(f"- שאריות/כפילויות: {residue_text}")
    manual = 'כן' if s['manual_check_required'] else 'לא'
    reason = s.get('manual_check_reason') or ''
    lines.append(f"- נדרשת בדיקה ידנית: {manual}{(' - ' + reason) if reason else ''}")
    lines.append('')
lines.append('## Residue וסיכוני תחזוקה')
lines.append('')
lines.append('- wrappers פעילים: C:\\ProgramData\\OpenClaw\\openclaw-Itzhak.cmd, C:\\ProgramData\\OpenClaw\\openclaw-Openclaw.cmd')
lines.append('- wrappers/refs ישנים אפשריים: OpenClaw - On Network Reconnect, backup-manager, smoke-test-build, image-team/runs שנמחקו ב-git status')
lines.append('- stale logs: commands.log וקבצי logs נוספים דורשים מדיניות רוטציה ידנית אם רוצים לצמצם משקל מקומי.')
lines.append('- stale model refs: ב-Openclaw מוגדר fallback gemma4:e2b, לא אומת כמודל זמין רץ כעת.')
lines.append('- stale backups refs: קיימים snapshotים רבים מסוג .bak ו-.clobbered בשני היוזרים.')
lines.append('')
lines.append('## קבצי פלט')
lines.append('')
lines.append(f'- {output_dir / "SYSTEM_MAP.md"}')
lines.append(f'- {output_dir / "systems.json"}')
lines.append(f'- {output_dir / "dashboard-data.json"}')

(output_dir / 'SYSTEM_MAP.md').write_text('\n'.join(lines), encoding='utf-8')

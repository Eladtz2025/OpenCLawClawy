#!/usr/bin/env python3
"""Organizer V2 — Photos module.

Verbs: auth | scan | plan | approve | apply | doctor

Uses workspace/credentials.json (Google Cloud OAuth client) and
token at workspace/token_photos.pickle.

Apply mode is dry-run by default. Apply NEVER deletes photos and
NEVER moves photos out of the user library. Apply only performs
album modifications listed in the approval package.

If the google-auth packages are not installed, the module degrades to
"preview-blocked" mode: emits empty buckets with a clear reason.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(os.environ.get('USERPROFILE', os.path.expanduser('~'))) / '.openclaw' / 'workspace'
ORG_ROOT = WORKSPACE / 'organizer'
MOD_BASE = ORG_ROOT / 'modules' / 'photos'
REPORTS = MOD_BASE / 'reports'
LOGS = MOD_BASE / 'logs'
STATE_PATH = MOD_BASE / 'state.json'

REPORTS.mkdir(parents=True, exist_ok=True)
LOGS.mkdir(parents=True, exist_ok=True)

CREDENTIALS_PATH = WORKSPACE / 'credentials.json'
TOKEN_PATH = WORKSPACE / 'token_photos.pickle'
AUTH_URL_PATH = MOD_BASE / 'state' / 'auth-url.txt'
AUTH_VERIFIER_PATH = MOD_BASE / 'state' / 'auth-verifier.txt'
AUTH_URL_PATH.parent.mkdir(parents=True, exist_ok=True)

SCAN_JSON     = REPORTS / 'scan-summary.json'
SCAN_REPORT   = REPORTS / 'scan-report.md'
PLAN_JSON     = REPORTS / 'plan.json'
PLAN_REPORT   = REPORTS / 'plan.md'
APPROVAL_JSON = REPORTS / 'approval-package.json'
APPROVAL_MD   = REPORTS / 'approval-package.md'
APPLY_JSON    = REPORTS / 'apply-log.json'
APPLY_MD      = REPORTS / 'apply-log.md'
LOG_PATH      = LOGS / 'module.log'

SCOPES = [
    'https://www.googleapis.com/auth/photoslibrary.appendonly',
    'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
    'https://www.googleapis.com/auth/photoslibrary.sharing',
]

# OAuth redirect URI. credentials.json is a Desktop-app client whose only
# configured redirect URI is http://localhost. Both the auth URL and the
# fetch_token call MUST use this value or Google rejects with
# "Missing required parameter: redirect_uri" / "redirect_uri_mismatch".
REDIRECT_URI = 'http://localhost'

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def append_log(line: str) -> None:
    with open(LOG_PATH, 'a', encoding='utf-8') as f:
        f.write(f"{now_utc()} {line}\n")


def write_json(p: Path, obj) -> None:
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, default=str)


def read_json(p: Path):
    if not p.exists():
        return None
    try:
        with open(p, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def write_text(p: Path, t: str) -> None:
    with open(p, 'w', encoding='utf-8') as f:
        f.write(t)


def update_state(patch: dict) -> None:
    s = read_json(STATE_PATH) or {
        'lastAuthAt': None, 'lastAuthOk': None, 'lastAuthMethod': None,
        'lastScanAt': None, 'lastScanItems': 0, 'lastScanMode': None,
        'lastPlanAt': None, 'lastPlanItems': 0,
        'lastApprovalAt': None, 'lastApprovalSha': None,
        'lastApplyAt': None, 'lastApplyDryRun': True, 'lastApplyResult': None,
    }
    s.update(patch)
    write_json(STATE_PATH, s)


def sha1_of(s: str) -> str:
    return hashlib.sha1(s.encode('utf-8')).hexdigest()


def deps_available() -> tuple[bool, str | None]:
    try:
        import google.oauth2.credentials  # noqa: F401
        import google.auth.transport.requests  # noqa: F401
        import google_auth_oauthlib.flow  # noqa: F401
        import requests  # noqa: F401
        return True, None
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------

def auth_status_dict() -> dict:
    has_creds = CREDENTIALS_PATH.exists()
    token_exists = TOKEN_PATH.exists()
    deps_ok, deps_err = deps_available()

    out = {
        'generatedAt': now_utc(),
        'credentialsPath': str(CREDENTIALS_PATH),
        'credentialsExists': has_creds,
        'tokenPath': str(TOKEN_PATH),
        'tokenExists': token_exists,
        'depsAvailable': deps_ok,
        'depsError': deps_err,
        'tokenStatus': None,
        'authUrl': None,
        'decision': None,
    }

    if not has_creds:
        out['decision'] = 'no_credentials_json'
        return out

    if token_exists and deps_ok:
        try:
            import pickle
            with open(TOKEN_PATH, 'rb') as f:
                creds = pickle.load(f)
            out['tokenStatus'] = {
                'valid': bool(getattr(creds, 'valid', False)),
                'expired': bool(getattr(creds, 'expired', False)),
                'hasRefreshToken': bool(getattr(creds, 'refresh_token', None)),
                'scopes': list(getattr(creds, 'scopes', []) or []),
            }
            if creds.valid:
                out['decision'] = 'authenticated'
                return out
            if creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request
                creds.refresh(Request())
                with open(TOKEN_PATH, 'wb') as f:
                    pickle.dump(creds, f)
                out['decision'] = 'refreshed'
                out['tokenStatus']['valid'] = True
                return out
            out['decision'] = 'token_invalid'
        except Exception as e:
            out['decision'] = f'token_load_error:{e}'
            return out

    if not deps_ok:
        out['decision'] = 'deps_missing'
        return out

    # Generate consent URL so the human can complete the auth flow.
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
        # Critical: set redirect_uri BEFORE building the URL. Without this the
        # generated URL omits redirect_uri and Google returns Error 400
        # "Missing required parameter: redirect_uri".
        flow.redirect_uri = REDIRECT_URI
        auth_url, _ = flow.authorization_url(
            prompt='consent',
            access_type='offline',
            include_granted_scopes='true',
        )
        out['authUrl'] = auth_url
        AUTH_URL_PATH.write_text(auth_url + '\n', encoding='utf-8')
        # Persist the PKCE code_verifier so a separate `--code` invocation can
        # finish the exchange with the correct verifier. The verifier is
        # single-use (becomes useless after token exchange) but should not be
        # printed in chat.
        if getattr(flow, 'code_verifier', None):
            AUTH_VERIFIER_PATH.write_text(str(flow.code_verifier), encoding='utf-8')
        out['redirectUri'] = REDIRECT_URI
        out['authUrlValid'] = ('redirect_uri=' in auth_url) and ('client_id=' in auth_url)
        out['decision'] = 'awaiting_user_consent'
    except Exception as e:
        out['decision'] = f'consent_url_error:{e}'
    return out


def verb_auth() -> None:
    args = sys.argv[2:]
    auth_code = None
    interactive = '--interactive' in args
    if '--code' in args:
        auth_code = args[args.index('--code') + 1]

    auth = auth_status_dict()

    # Path A — fully interactive: open a browser, run a local-server callback,
    # capture the code automatically, and save the token. One human action only.
    if interactive and auth['decision'] in (
        'awaiting_user_consent', 'token_invalid', 'no_credentials_json', 'deps_missing'
    ):
        deps_ok, deps_err = deps_available()
        if not deps_ok:
            auth['decision'] = f'deps_missing:{deps_err}'
        else:
            try:
                from google_auth_oauthlib.flow import InstalledAppFlow
                import pickle
                flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
                # run_local_server picks a free port, opens the browser, captures the
                # redirect from Google, exchanges the code, and returns valid creds.
                # Bounded wait so the call cannot hang forever if the user steps
                # away. 5 minutes is plenty for a single consent flow.
                creds = flow.run_local_server(
                    port=0,
                    prompt='consent',
                    access_type='offline',
                    open_browser=True,
                    timeout_seconds=300,
                )
                with open(TOKEN_PATH, 'wb') as f:
                    pickle.dump(creds, f)
                auth['decision'] = 'authenticated_via_interactive'
                auth['tokenExists'] = True
                auth['tokenStatus'] = {
                    'valid': True, 'expired': False,
                    'hasRefreshToken': bool(creds.refresh_token),
                    'scopes': list(creds.scopes or []),
                }
            except Exception as e:
                auth['decision'] = f'interactive_error:{e}'

    # Path B — manual: human has the URL from auth-url.txt, completed consent,
    # copied the `code` parameter from the localhost redirect, passed it via --code.
    if auth_code and auth['decision'] in (
        'awaiting_user_consent', 'token_invalid', 'no_credentials_json'
    ):
        deps_ok, deps_err = deps_available()
        if not deps_ok:
            auth['decision'] = f'deps_missing:{deps_err}'
        else:
            try:
                from google_auth_oauthlib.flow import InstalledAppFlow
                import pickle
                flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
                # Must match the redirect_uri used when generating the auth URL.
                flow.redirect_uri = REDIRECT_URI
                # Restore the PKCE verifier from when the auth URL was generated;
                # without it Google rejects the exchange ("missing code_verifier").
                if AUTH_VERIFIER_PATH.exists():
                    try:
                        flow.code_verifier = AUTH_VERIFIER_PATH.read_text(encoding='utf-8').strip()
                    except Exception:
                        pass
                flow.fetch_token(code=auth_code)
                creds = flow.credentials
                with open(TOKEN_PATH, 'wb') as f:
                    pickle.dump(creds, f)
                # Verifier becomes useless once consumed — clear it.
                try:
                    if AUTH_VERIFIER_PATH.exists():
                        AUTH_VERIFIER_PATH.unlink()
                except Exception:
                    pass
                auth['decision'] = 'authenticated_via_code'
                auth['tokenExists'] = True
                auth['tokenStatus'] = {'valid': True, 'expired': False,
                                       'hasRefreshToken': bool(creds.refresh_token),
                                       'scopes': list(creds.scopes or [])}
            except Exception as e:
                auth['decision'] = f'fetch_token_error:{e}'

    update_state({
        'lastAuthAt': auth['generatedAt'],
        'lastAuthOk': auth['decision'] in ('authenticated', 'refreshed', 'authenticated_via_code'),
        'lastAuthMethod': auth['decision'],
    })
    append_log(f"auth decision={auth['decision']}")
    # Mask the auth URL slightly: keep host but truncate the very long opaque parts
    safe = dict(auth)
    if safe.get('authUrl'):
        # keep length but don't full-print to terminal; the file already has the URL
        safe['authUrl'] = (safe['authUrl'][:80] + '...[truncated, full URL written to '
                          + str(AUTH_URL_PATH) + ']')
    print(json.dumps(safe, indent=2, default=str))


# ---------------------------------------------------------------------------
# SCAN
# ---------------------------------------------------------------------------

def gphotos_request(creds, method: str, url: str, json_body=None):
    import requests
    headers = {'Authorization': f'Bearer {creds.token}', 'Content-Type': 'application/json'}
    r = requests.request(method, url, headers=headers, json=json_body, timeout=30)
    return r


def scan_live(creds) -> dict:
    """Best-effort live scan. Returns counts and a small sample only — never the
    full mediaItems list, to keep scan output bounded.
    """
    out = {
        'mode': 'live',
        'albums': {'count': 0, 'sample': []},
        'mediaItems': {'count': 0, 'sample': []},
        'screenshotsLikely': {'count': 0},
        'downloadedLikely': {'count': 0},
        'oldMedia': {'count': 0},
        'errors': [],
    }
    try:
        # Albums
        next_page = None
        all_albums = []
        for _ in range(20):  # cap pagination
            url = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50'
            if next_page:
                url += f'&pageToken={next_page}'
            r = gphotos_request(creds, 'GET', url)
            if r.status_code != 200:
                out['errors'].append(f'albums HTTP {r.status_code}: {r.text[:200]}')
                break
            j = r.json()
            for a in j.get('albums', []):
                all_albums.append({'id': a.get('id'), 'title': a.get('title'),
                                   'mediaItemsCount': a.get('mediaItemsCount')})
            next_page = j.get('nextPageToken')
            if not next_page:
                break
        out['albums']['count'] = len(all_albums)
        out['albums']['sample'] = all_albums[:20]
    except Exception as e:
        out['errors'].append(f'albums error: {e}')

    # Sample media items (one page)
    try:
        r = gphotos_request(creds, 'POST',
                            'https://photoslibrary.googleapis.com/v1/mediaItems:search',
                            {'pageSize': 50})
        if r.status_code == 200:
            j = r.json()
            items = j.get('mediaItems', []) or []
            out['mediaItems']['count'] = len(items)
            out['mediaItems']['sample'] = [
                {'id': i.get('id'),
                 'filename': i.get('filename'),
                 'mimeType': i.get('mimeType'),
                 'productUrl': i.get('productUrl'),
                 'creationTime': (i.get('mediaMetadata') or {}).get('creationTime')}
                for i in items[:20]
            ]
            screenshots = [i for i in items if 'Screenshot' in (i.get('filename') or '')]
            downloaded = [i for i in items if any(k in (i.get('filename') or '').lower()
                                                  for k in ('download', 'whatsapp', 'screenshot_'))]
            now = datetime.now(timezone.utc)
            old = []
            for i in items:
                ts = (i.get('mediaMetadata') or {}).get('creationTime')
                if ts:
                    try:
                        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                        if (now - dt).days > 365 * 5:
                            old.append(i)
                    except Exception:
                        pass
            out['screenshotsLikely']['count'] = len(screenshots)
            out['downloadedLikely']['count'] = len(downloaded)
            out['oldMedia']['count'] = len(old)
        else:
            out['errors'].append(f'mediaItems HTTP {r.status_code}: {r.text[:200]}')
    except Exception as e:
        out['errors'].append(f'mediaItems error: {e}')

    return out


def verb_scan() -> None:
    auth = auth_status_dict()
    scan = {
        'module': 'photos', 'version': 1,
        'generatedAt': now_utc(),
        'authDecision': auth['decision'],
        'mode': 'unknown',
        'data': {},
        'notes': [],
    }
    if auth['decision'] in ('authenticated', 'refreshed', 'authenticated_via_code'):
        try:
            import pickle
            with open(TOKEN_PATH, 'rb') as f:
                creds = pickle.load(f)
            scan['data'] = scan_live(creds)
            scan['mode'] = 'live'
        except Exception as e:
            scan['mode'] = 'preview-error'
            scan['notes'].append(f'live scan crashed: {e}')
    else:
        scan['mode'] = 'preview-blocked'
        scan['notes'].append(f'auth not ready (decision={auth["decision"]}); scan emitted empty.')
        if auth.get('authUrl'):
            scan['notes'].append('Consent URL written to ' + str(AUTH_URL_PATH))
        scan['data'] = {'mode': scan['mode'], 'albums': {'count': 0}, 'mediaItems': {'count': 0}}

    write_json(SCAN_JSON, scan)

    md_lines = [
        '# Photos scan report', '',
        f"Generated: {scan['generatedAt']}",
        f"mode: {scan['mode']}",
        f"authDecision: {scan['authDecision']}",
        '',
    ]
    if scan['mode'] == 'live':
        d = scan['data']
        md_lines += [
            '## Counts', '',
            f"- Albums: {d['albums']['count']}",
            f"- Media items in latest page: {d['mediaItems']['count']}",
            f"- Likely screenshots in sample: {d['screenshotsLikely']['count']}",
            f"- Likely downloaded/whatsapp in sample: {d['downloadedLikely']['count']}",
            f"- Likely >5y old in sample: {d['oldMedia']['count']}",
        ]
    md_lines += ['', '## Notes', '']
    md_lines += [f'- {n}' for n in scan['notes']] or ['- (none)']
    write_text(SCAN_REPORT, '\n'.join(md_lines))

    items = (scan.get('data', {}).get('mediaItems', {}).get('count') or 0) + (scan.get('data', {}).get('albums', {}).get('count') or 0)
    update_state({'lastScanAt': scan['generatedAt'], 'lastScanItems': items, 'lastScanMode': scan['mode']})
    append_log(f"scan complete mode={scan['mode']} items={items}")
    print(SCAN_REPORT)


# ---------------------------------------------------------------------------
# PLAN — proposes album-organization actions only.
# ---------------------------------------------------------------------------

def verb_plan() -> None:
    scan = read_json(SCAN_JSON)
    if not scan:
        raise RuntimeError('no scan-summary.json — run scan first')
    items = []
    def add(kind, action, rationale):
        items.append({'kind': kind, 'action': action, 'rationale': rationale})

    add('group-screenshots',  'create-album-and-add-from-search:Screenshots', 'group screenshots into a single curation album')
    add('group-downloaded',   'create-album-and-add-from-search:Downloaded',  'group downloaded/whatsapp content into a single album')
    add('group-old-pre-2020', 'create-album-and-add-from-search:Pre-2020',    'group pre-2020 photos for archival review')
    add('flag-near-duplicates', 'mark-only',                                  'identify near-duplicates and surface them; never auto-delete')

    plan = {
        'module': 'photos', 'version': 1,
        'generatedAt': now_utc(),
        'scanGeneratedAt': scan['generatedAt'],
        'scanMode': scan['mode'],
        'items': items,
        'totals': {'count': len(items)},
        'safetyRules': [
            'Apply mode performs ONLY album-add operations and tag/label-style metadata.',
            'Never delete media. Never remove from existing albums without explicit per-item approval.',
            'Each item must be in the approval package to be applied.',
            'Apply default is dry-run.'
        ],
    }
    write_json(PLAN_JSON, plan)
    md = '\n'.join([
        '# Photos plan', '',
        f"Generated: {plan['generatedAt']} (scan {plan['scanGeneratedAt']}, mode={plan['scanMode']})",
        '', '## Proposed album operations',
        '', '| kind | action | rationale |',
        '|------|--------|-----------|',
        *[f"| {i['kind']} | {i['action']} | {i['rationale']} |" for i in items],
        '', '## Safety rules',
        '', *[f'- {r}' for r in plan['safetyRules']],
        '',
    ])
    write_text(PLAN_REPORT, md)
    update_state({'lastPlanAt': plan['generatedAt'], 'lastPlanItems': len(items)})
    append_log(f"plan complete items={len(items)}")
    print(PLAN_REPORT)


def verb_approve() -> None:
    plan = read_json(PLAN_JSON)
    if not plan:
        raise RuntimeError('no plan.json — run plan first')
    items = plan['items']
    pkg = {
        'module': 'photos', 'version': 1,
        'generatedAt': now_utc(),
        'planGeneratedAt': plan['generatedAt'],
        'items': items,
        'totals': {'count': len(items)},
        'contractSha1': sha1_of('\n'.join(f"{i['kind']}|{i['action']}" for i in items)),
        'safetyRules': plan['safetyRules'],
    }
    write_json(APPROVAL_JSON, pkg)
    md = '\n'.join([
        '# Photos approval package', '',
        f"Generated: {pkg['generatedAt']}",
        f"Items: {pkg['totals']['count']}",
        f"contractSha1: {pkg['contractSha1']}",
        '', '## Approved album operations',
        '', '| kind | action |',
        '|------|--------|',
        *[f"| {i['kind']} | {i['action']} |" for i in items],
        '', '## Safety rules',
        '', *[f'- {r}' for r in pkg['safetyRules']],
        '',
    ])
    write_text(APPROVAL_MD, md)
    update_state({'lastApprovalAt': pkg['generatedAt'], 'lastApprovalSha': pkg['contractSha1']})
    append_log(f"approve complete items={len(items)} contract={pkg['contractSha1']}")
    print(APPROVAL_MD)


def verb_apply() -> None:
    pkg = read_json(APPROVAL_JSON)
    if not pkg:
        raise RuntimeError('no approval-package.json — run approve first')
    dry_run = '--no-dry-run' not in sys.argv

    auth = auth_status_dict()
    log = []
    if dry_run:
        for it in pkg['items']:
            log.append({'kind': it['kind'], 'action': it['action'], 'result': 'would-create-album', 'dryRun': True})
    elif auth['decision'] not in ('authenticated', 'refreshed', 'authenticated_via_code'):
        for it in pkg['items']:
            log.append({'kind': it['kind'], 'action': it['action'], 'result': 'auth-blocked',
                        'error': f"auth.decision={auth['decision']}", 'dryRun': False})
    else:
        try:
            import pickle
            with open(TOKEN_PATH, 'rb') as f:
                creds = pickle.load(f)
        except Exception as e:
            for it in pkg['items']:
                log.append({'kind': it['kind'], 'action': it['action'], 'result': 'auth-blocked',
                            'error': f"token-load: {e}", 'dryRun': False})
            creds = None
        if creds is not None:
            for it in pkg['items']:
                if it['action'].startswith('create-album-and-add-from-search:'):
                    title = it['action'].split(':', 1)[1]
                    try:
                        r = gphotos_request(creds, 'POST',
                                            'https://photoslibrary.googleapis.com/v1/albums',
                                            {'album': {'title': f'Organizer / {title}'}})
                        if r.status_code in (200, 201):
                            log.append({'kind': it['kind'], 'action': it['action'], 'result': 'album-created',
                                        'albumId': r.json().get('id'), 'dryRun': False})
                        else:
                            log.append({'kind': it['kind'], 'action': it['action'], 'result': 'album-error',
                                        'error': f"HTTP {r.status_code}: {r.text[:200]}", 'dryRun': False})
                    except Exception as e:
                        log.append({'kind': it['kind'], 'action': it['action'], 'result': 'album-error',
                                    'error': str(e), 'dryRun': False})
                else:
                    log.append({'kind': it['kind'], 'action': it['action'], 'result': 'mark-only-noop', 'dryRun': False})

    apply_doc = {
        'module': 'photos', 'version': 1,
        'generatedAt': now_utc(),
        'approvalContractSha1': pkg['contractSha1'],
        'dryRun': dry_run,
        'log': log,
        'totals': {
            'considered': len(log),
            'wouldCreate': sum(1 for x in log if x['result'] == 'would-create-album'),
            'created': sum(1 for x in log if x['result'] == 'album-created'),
            'authBlocked': sum(1 for x in log if x['result'] == 'auth-blocked'),
            'errors': sum(1 for x in log if x['result'] == 'album-error'),
        },
    }
    write_json(APPLY_JSON, apply_doc)
    md = '\n'.join([
        '# Photos apply log', '',
        f"Generated: {apply_doc['generatedAt']}",
        f"dryRun: {apply_doc['dryRun']}",
        f"Considered: {apply_doc['totals']['considered']} | wouldCreate: {apply_doc['totals']['wouldCreate']} | created: {apply_doc['totals']['created']} | authBlocked: {apply_doc['totals']['authBlocked']} | errors: {apply_doc['totals']['errors']}",
        '',
    ])
    write_text(APPLY_MD, md)
    update_state({
        'lastApplyAt': apply_doc['generatedAt'],
        'lastApplyDryRun': dry_run,
        'lastApplyResult': apply_doc['totals'],
    })
    append_log(f"apply complete dryRun={dry_run} considered={apply_doc['totals']['considered']}")
    print(APPLY_MD)


def verb_doctor() -> None:
    s = read_json(STATE_PATH)
    print('=== Photos module doctor ===')
    if not s:
        print('no state yet (run auth or scan first)')
        return
    print(f"lastAuthAt:     {s.get('lastAuthAt')} ok={s.get('lastAuthOk')} method={s.get('lastAuthMethod')}")
    print(f"lastScanAt:     {s.get('lastScanAt')} mode={s.get('lastScanMode')} items={s.get('lastScanItems')}")
    print(f"lastPlanAt:     {s.get('lastPlanAt')} items={s.get('lastPlanItems')}")
    print(f"lastApprovalAt: {s.get('lastApprovalAt')} sha={s.get('lastApprovalSha')}")
    print(f"lastApplyAt:    {s.get('lastApplyAt')} dryRun={s.get('lastApplyDryRun')}")
    if s.get('lastApplyResult'):
        print(f"lastApplyResult: {json.dumps(s['lastApplyResult'])}")


VERBS = {
    'auth': verb_auth,
    'scan': verb_scan,
    'plan': verb_plan,
    'approve': verb_approve,
    'apply': verb_apply,
    'doctor': verb_doctor,
}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in VERBS:
        print('usage: python photos.py {auth|scan|plan|approve|apply|doctor}', file=sys.stderr)
        sys.exit(2)
    try:
        VERBS[sys.argv[1]]()
    except Exception as e:
        append_log(f"ERROR {sys.argv[1]}: {e}")
        print(f"ERROR ({sys.argv[1]}): {e}", file=sys.stderr)
        sys.exit(1)

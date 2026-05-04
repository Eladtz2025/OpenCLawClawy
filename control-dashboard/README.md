# OpenClaw Control Dashboard

Local dashboard to operate OpenClaw systems by **friendly names** instead of topic numbers.

## Aliases

| Alias | System | Telegram topic |
|---|---|---|
| `news` | News Dashboard | 106 |
| `organizer` | Organizer V2 | 2670 |
| `system-map` | System Map | 987 |

## Run

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\control-dashboard\server.js"
```

Default URL: **http://127.0.0.1:7777**

Override port: `set OPENCLAW_DASHBOARD_PORT=18000` (cmd) or `$env:OPENCLAW_DASHBOARD_PORT=18000` (PowerShell) before starting.

Stop with **Ctrl+C**.

## Hard limits

- Server binds **only to 127.0.0.1** (loopback). Non-loopback requests are rejected by the request handler as a second layer of defence.
- **Zero npm dependencies** — uses only Node built-ins.
- All actions go through the registry (`registry/systems.json`). Unregistered actions are 404.
- Actions with `requiresConfirmation: true` require `POST { "confirm": true }`. The UI confirms via a modal before sending.
- `/api/file?path=...` only serves files explicitly listed in the registry's `files` blocks.
- The action runner captures child-process stdout/stderr and never inherits stdio.
- No secret values are read or returned. The OpenClaw gateway token, the Telegram bot token, and the Google OAuth `credentials.json` are NEVER opened by the dashboard.

## API (also usable by the future Telegram command bridge)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | server pulse |
| GET | `/api/systems` | full registry (`systems.json`) |
| GET | `/api/system/:alias/status` | per-system status payload |
| POST | `/api/system/:alias/action/:name` | invoke an action; body: `{ "confirm": true }` |
| GET | `/api/file?path=<absolute>` | read a registered file (path-allowlisted) |

The Telegram bridge can map `/news doctor` → `POST /api/system/news/action/doctor`, etc.

## Files

```
control-dashboard/
├── server.js                 # http server, routing, action dispatch
├── package.json              # type: commonjs, no deps
├── README.md                 # this file
├── lib/
│   └── runtime.js            # JSON read, child-proc runner, allowlist helpers
├── providers/
│   ├── news.js
│   ├── organizer.js
│   └── system-map.js
├── registry/
│   ├── systems.json          # canonical alias → system mapping
│   ├── system-map-todos.json # hand-curated TODOs/blockers
│   └── system-map-next-work.json  # hand-curated next-work backlog
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── state/
    └── action-log.jsonl      # rolling action log
```

## Action types

| Mode | Behavior | Examples |
|---|---|---|
| `read` | Read-only doctor / status. No side effects. | `news.doctor`, `organizer.doctor` |
| `exec` | Runs a local script via child process. May write artifacts (e.g., scan outputs). | `organizer.tick`, `organizer.computer.scan`, `news.dry-run-pipeline` |
| `send` | Sends data outside this machine via the OpenClaw gateway. Confirmation required + duplicate guard keyed on buildId. | `news.send-morning-ping-dm` |

`exec` actions on the Organizer modules call the `apply` verb in **dry-run** by default. There is no UI button that runs `apply --no-dry-run`; doing real cleanups requires running the underlying script directly with `-NoDryRun` (Computer) or `--no-dry-run` (Gmail/Photos).

### `news.send-morning-ping-dm` (real send, with duplicate guard)

The dashboard shells out to `openclaw gateway call send` (via
`bin/send-via-gateway.js`) using the gateway token loaded from
`~/.openclaw/gateway.token` and passed as `OPENCLAW_GATEWAY_TOKEN` env.
The token never appears in argv or logs.

**Idempotency**: the action reads the current `buildId` from
`news-dashboard/state.json`. If it matches the `buildId` recorded in
`state/news-last-sent.json`, the action returns
`{ ok: true, duplicate: true }` and **does not send**. The
`idempotencyKey` passed to the gateway is also derived from the buildId,
so a second hit on the gateway side would also be deduplicated.

**Target**: always the configured Telegram DM
(`telegram:<deliveryDmId>`), never the topic.

**Result is logged** in `state/action-log.jsonl` plus a per-send record in
`state/news-last-sent.json` (buildId, sentAt, gatewayMessageId).

## Claude Code tab

A second tab on the dashboard runs `claude --print` (Claude Code in
non-interactive mode) as a child process and streams output back to a
per-task JSON file under `state/claude-tasks/<id>.json`.

| Mode | Equivalent CLI flags | Use for |
|---|---|---|
| `plan` | `--permission-mode plan` | Read/think only; no edits, no shell. Safest. |
| `safe` | `--permission-mode acceptEdits --allowedTools "Read Glob Grep Edit Write WebFetch Bash(ls *) Bash(cat *) Bash(echo *) Bash(node *) Bash(python *) Bash(npm run *) Bash(git status) Bash(git diff*) Bash(git log*) Bash(git show*) Bash(curl --silent *) Bash(curl -sS *) Bash(npx *)"` | File edits + non-destructive shell. **Default.** |
| `full` | `--permission-mode acceptEdits` (no allowedTools restriction) | Broader shell. Still NEVER passes `--dangerously-skip-permissions`. |

Common rules across all three modes:
- `cwd` is forced to `~/.openclaw/workspace` (refuses to escape that root).
- Destructive perms flag (`--dangerously-skip-permissions`) is **never** added.
- `--no-session-persistence` is always set (clean per-task footprint).
- POST `/api/claude/run` requires `{ "confirm": true }` (HTTP 412 otherwise).
- Stop a running task: POST `/api/claude/task/<id>/stop` (sends SIGTERM).

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/claude/run` | start a task; body: `{confirm, prompt, mode, model?, effort?}` |
| GET  | `/api/claude/tasks?limit=N` | recent tasks (id, prompt preview, status) |
| GET  | `/api/claude/task/:id` | full task state including stdout/stderr |
| POST | `/api/claude/task/:id/stop` | SIGTERM the running task |

## Remote access (Tailscale-only)

The dashboard can additionally serve a **second listener** bound exclusively
to your Tailscale IP, gated by a shared bearer token. This lets you reach
the dashboard from your phone over the Tailscale VPN — no port forwarding,
no public DNS, no ngrok, no Funnel. The localhost listener on
`127.0.0.1:7777` is unaffected.

**Hard guarantees** (enforced in `lib/remote-access.js`):

- Never binds to `0.0.0.0`. Only to the detected `100.64.0.0/10` (CGNAT) IP.
- Never starts if no Tailscale IP is found, or if no token file exists.
- Rejects any inbound request whose remote address is outside `100.64.0.0/10`.
- Requires a valid bearer token on every request (constant-time compare).
- The token is stored in `~/.openclaw/dashboard-remote.token` with a tightened
  ACL and is never logged or returned over the wire.
- The token file is re-read on every request, so rotation takes effect
  immediately — no restart needed.

| Default | Value |
|---|---|
| Local URL | `http://127.0.0.1:7777` (unchanged) |
| Remote port | `7787` (override `OPENCLAW_REMOTE_PORT`) |
| Remote bind | only the detected Tailscale `100.x.y.z` |
| Token file | `~/.openclaw/dashboard-remote.token` |
| Disable env | `OPENCLAW_REMOTE_DISABLED=1` |

### Windows setup

The dashboard runs in the background under the `OpenClaw-ControlDashboard`
scheduled task (registered by `dashboard-service.ps1 install`). Remote access
is enabled / disabled via the same service script — no separate `node
server.js` window required.

```powershell
# 1. Install + sign in to Tailscale (https://tailscale.com/download/windows).
#    Confirm you have a 100.x.y.z address:
tailscale ip -4

# 2. Enable remote access (creates the token if missing, restarts the
#    background service, then prints the remote URL):
cd C:\Users\<you>\.openclaw\workspace\control-dashboard
.\scripts\dashboard-service.ps1 remote-on
#    Copy the printed token into your password manager / phone bookmark.
#    The dashboard keeps running in the background after this command exits.

# 3. From the same Windows box, sanity-check the remote listener:
$tok = .\scripts\remote-token-setup.ps1 -Show
curl.exe -s -H "Authorization: Bearer $tok" "http://$(tailscale ip -4):7787/api/health"
```

### Phone setup

1. Install Tailscale on the phone, sign in to the **same** tailnet, turn the VPN ON.
2. From your password manager, copy the bearer token.
3. Open the phone's browser to:

   ```
   http://<your-windows-tailscale-ip>:7787/?token=<paste-token>
   ```

   The dashboard sets a long-lived `oc_remote_token` cookie (HttpOnly,
   SameSite=Strict) and redirects to a clean URL with the token stripped.

4. Bookmark `http://<your-windows-tailscale-ip>:7787/`. The cookie now
   carries the auth automatically; the token is no longer in the URL.

### Operations

All of these are run from `control-dashboard\` and operate on the background
scheduled-task service. The dashboard is never coupled to an open PowerShell
window.

| Action | Command |
|---|---|
| Enable remote access | `.\scripts\dashboard-service.ps1 remote-on` |
| Disable remote access | `.\scripts\dashboard-service.ps1 remote-off` |
| Check remote status | `.\scripts\dashboard-service.ps1 remote-status` |
| Restart the service | `.\scripts\dashboard-service.ps1 restart` |
| Rotate token | `.\scripts\remote-token-setup.ps1 -Rotate` (effective immediately; old cookies on phone need a one-shot `?token=<new>`) |
| Show current token | `.\scripts\remote-token-setup.ps1 -Show` |
| Sidebar UI | bottom-left panel labelled `REMOTE · TAILSCALE` |

Under the hood, `remote-on` creates the token file (no-op if one already
exists) and runs `restart`; `remote-off` deletes the token file and runs
`restart`. The token is auto-detected by `server.js` on startup — there is no
separate "remote" process to manage.

### Verification

**It is VPN-only:**

```powershell
# 1. With Tailscale UP, from this machine:
$tok = .\scripts\remote-token-setup.ps1 -Show
$ip  = tailscale ip -4
curl.exe -s -o NUL -w "%{http_code}`n" -H "Authorization: Bearer $tok" "http://${ip}:7787/api/health"
# expect: 200

# 2. With Tailscale DOWN on the phone, the bookmark should fail to connect
#    (TCP handshake never completes because the listener is bound to the
#    Tailscale interface only).

# 3. Sniff the local bindings:
netstat -ano | findstr ":7787"
# expect a single line bound to 100.x.y.z:7787 (NOT 0.0.0.0:7787)
```

**It is not public:**

```powershell
# 4. From a non-Tailscale network (mobile data with VPN OFF), try:
#       http://<your-public-ip>:7787/
#    expect: connection refused / timeout. Nothing answers — there is no
#    public binding, no router forward, no Funnel.

# 5. Confirm only loopback + Tailscale interfaces are bound:
netstat -ano | findstr "LISTENING" | findstr ":777"
# expect:
#   TCP    127.0.0.1:7777   LISTENING   <pid>
#   TCP    100.x.y.z:7787   LISTENING   <pid>
# and NO 0.0.0.0:7787 / [::]:7787 line.
```

If the remote listener is unwanted, set `OPENCLAW_REMOTE_DISABLED=1` in the
service environment, or delete the token file with `-Disable`. The local
loopback dashboard keeps working in both cases.

## Telegram command bridge

The dashboard exposes a generic dispatch entry point:

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/telegram/commands` | list registered commands |
| POST | `/api/telegram/dispatch` | run a command; body `{ command, args, fromUserId?, replyToMessageId? }` |

The dispatch table lives in `lib/telegram-dispatch.js`. Each entry maps a
Telegram-style command to either a Claude-runner task (with a built-in
prompt) or a registered system action. Currently registered:

| Command | Effect |
|---|---|
| `/traffic <text>` | Starts a Claude task with the **Traffic-Law-Appeal-IL** agent's start prompt; user `<text>` is appended as the opening message. Mode: `auto`. |

Future entries will translate the existing system actions, e.g.:

```
/news doctor                          → POST /api/system/news/action/doctor
/organizer doctor                     → POST /api/system/organizer/action/doctor
/organizer tick                       → POST /api/system/organizer/action/tick
/organizer computer scan              → POST /api/system/organizer/action/computer.scan
/system-map                           → GET  /api/system/system-map/status
```

A standalone poller that delivers Telegram messages *to* this endpoint
ships in `workspace/telegram-bridge/`. It uses a dedicated bot token (so
it doesn't fight the OpenClaw daemon's main bot for `getUpdates`) and
sends replies back through the existing `bin/send-via-gateway.js`. See
`telegram-bridge/README.md` for setup.

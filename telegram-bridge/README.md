# OpenClaw Telegram Bridge

Standalone Telegram poller that turns `/<command> [args]` messages into
control-dashboard tasks.

- Currently routes `/traffic <text>` → the **Traffic-Law-Appeal-IL** agent
  (kicks off a Claude Code task with the agent's start prompt prepended).
- Sends progress + final output back to the user via the existing OpenClaw
  gateway (`control-dashboard/bin/send-via-gateway.js`).
- Does **not** share a bot with the OpenClaw daemon — it polls its own bot
  so there's no contention over `getUpdates`.

## Why a separate bot?

Telegram's long-poll API only allows **one** consumer per bot token at a
time. The OpenClaw daemon already polls its main bot. Adding a second
poller on the same token would cause updates to be split unpredictably.
A dedicated bot is the cleanest separation and lets the user decide which
persona they want to talk to (`@OpenClawBot` for the main agent,
`@OpenClawTrafficBot` for legal stuff, etc.).

## One-time setup

1. **Create a new bot** via [@BotFather](https://t.me/BotFather):
   `/newbot` → name it (e.g. `OpenClaw Traffic`) → username (e.g.
   `openclaw_traffic_bot`). Copy the token.

2. **Save the token** at `~/.openclaw/traffic-bridge.token` (one line, no
   wrapping quotes), or set `TRAFFIC_BRIDGE_TOKEN` in the environment.
   The file is read at startup and never logged.

3. **Send `/start` to your new bot once** from your Telegram account so
   Telegram opens a chat with it (otherwise outbound `sendMessage` from
   the gateway will fail with "chat not found").

4. **Discover your numeric Telegram user ID** if you don't already know
   it. The simplest way is to run the bridge once with `--self-check` and
   then send any message to the bot — it will log the sender's ID, and
   you can refuse to dispatch until that ID is in `config.json`.
   Most OpenClaw users already know their ID (it appears in
   `control-dashboard/registry/systems.json` as `deliveryDmId`).

5. **Copy `config.example.json` to `config.json`** and fill in
   `allowedUserIds` (array of strings of numeric Telegram user IDs).
   Without at least one entry the bridge refuses to start.

   ```json
   {
     "allowedUserIds": ["620906995"],
     "sessionKey": "agent:traffic-law:telegram:bridge",
     "accountId": "default"
   }
   ```

   Optional fields:
   - `threadId` — if you want replies to land in a specific topic of a
     supergroup. Leave `null` for normal DMs.
   - `botUsername` — set to the bot's `@username` (without `@`) so that
     `/traffic@otherbot` from a group is correctly ignored.
   - `perUserRateLimitMs` — minimum interval between successive dispatches
     from the same user. Default 5000 ms.

6. **Self-check**:

   ```powershell
   node "C:\Users\Itzhak\.openclaw\workspace\telegram-bridge\bridge.js" --self-check
   ```

   This pings the dashboard, the dispatch endpoint, and Telegram's
   `getMe`. Exits 0 on success.

7. **Run it** — foreground for testing, scheduled task for production:

   ```powershell
   node "C:\Users\Itzhak\.openclaw\workspace\telegram-bridge\bridge.js"
   ```

   To register as a per-user background task, mirror the pattern in
   `control-dashboard/scripts/dashboard-service.ps1`. (Not bundled here —
   keep it out-of-band until the bridge is stable in foreground.)

## What the bridge does

1. Polls `getUpdates` with a 25-second long-poll. Persists `update_id`
   under `state/offset.json` so restarts pick up where they left off.
2. On each update with a `text` payload, parses `/cmd [args]` (handles
   `/cmd@bot` form too).
3. If the sender is in `allowedUserIds` and not rate-limited, POSTs
   `{ command, args, fromUserId, replyToMessageId }` to
   `http://127.0.0.1:7777/api/telegram/dispatch` (override the URL with
   `OPENCLAW_DASHBOARD_URL`).
4. Sends an immediate ack with the `taskId` and live-view URL.
5. Polls `/api/claude/task/<id>` every ~4s for up to 25 min. When the
   task ends, sends the trailing 3.5K bytes of stdout back to Telegram.

## Hard limits

- Refuses to start without `allowedUserIds` (no silent operation).
- Token is read from a file or env var; never logged, never echoed.
- Talks to the dashboard over loopback only.
- Outbound replies go through `bin/send-via-gateway.js`, so they reuse
  the same gateway token + idempotency story as the rest of OpenClaw.

## Files

```
telegram-bridge/
├── bridge.js                 # poller + dispatcher
├── package.json              # node-only, zero deps
├── config.example.json       # template — copy to config.json
├── config.json               # your real config (gitignored)
└── state/
    └── offset.json           # last processed update_id (gitignored)
```

## Adding a second command

The dispatch table lives in
`control-dashboard/lib/telegram-dispatch.js`. Append an entry to
`COMMANDS` whose `build({ args })` returns either a Claude prompt or a
registered system action; restart the dashboard. The bridge needs no
changes.

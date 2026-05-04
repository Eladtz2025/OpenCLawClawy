---
name: mcp-connectivity-check
description: Read-only smoke test that proves the Claude Code ↔ OpenClaw MCP bridge is alive without touching private data, channels, files, or the shell.
---

# mcp-connectivity-check

## Why
Confirm Claude Code can reach OpenClaw's MCP gateway end-to-end before
running anything that actually mutates state.

## What it does
Three MCP calls, all read-only and idempotent:

1. `mcp__openclaw__conversations_list` (limit: 1) — gateway + auth alive
2. `mcp__openclaw__events_poll`        (limit: 1) — event bus reachable
3. `mcp__openclaw__permissions_list_open`        — approval queue reachable

## Pass criteria
- All three calls return without error.
- Counts are reported. Empty results are fine.
- No tool prompts the user for unexpected approval.

## Hard limits
- No Telegram, no webchat, no Discord — metadata only.
- No filesystem writes.
- No shell exec.
- No secrets, tokens, or message bodies in output.
- No mutating MCP calls (`messages_send`, `permissions_respond`, etc.).

## How to run from Claude Code
Ask Claude Code:

> Run the mcp-connectivity-check skill.

Claude makes the three calls in parallel and reports:

```
PASS — conversations: <N>, events: <N>, open approvals: <N>
```
or

```
FAIL — <which call> errored: <one-line error>
```

# Organizer V2 Orchestrator Tick

Generated UTC: 2026-05-03T07:03:41.7099936Z

| Module   | Enabled | Status         | Detail |
|----------|---------|----------------|--------|
| computer | True | ok | scan fresh |
| gmail | True | ok | authenticated |
| photos | True | ok | authenticated |

## Notes

- Computer is the always-on module. Gmail and Photos are opt-in.
- A blocked module increments `consecutiveBlockedTicks` until `maxBlockedTicksBeforeQuiet`, then enters `quieted`.
- This tick uses no Docker and no LLM calls.

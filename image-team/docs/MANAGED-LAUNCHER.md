# MANAGED-LAUNCHER

The project now includes a managed-launcher contract layer.

## Current behavior
Per job, the system can now write:
- `managed-start.json` — whether bring-up is blocked or ready for a launcher
- `healthcheck.json` — whether any expected local service port is live

## Purpose
This separates:
1. engine discovery
2. bring-up eligibility
3. managed start state
4. service health
5. execution

So once a runnable app path appears, the remaining step is smaller and safer.

## Current observed state
- managed start: blocked
- health: no service up
- lifecycle: recipe-only

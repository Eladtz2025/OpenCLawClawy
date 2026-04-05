# SYSTEM-STATE-MODEL

## Engine lifecycle states
- recipe-only
- app-present
- launcher-ready
- service-live
- execution-capable
- production-ready

## Current observed state
- Comfy: recipe-only
- Forge: recipe-only

This is now measured automatically per run and written to `system-state.json`.

## Transition rules
- recipe-only -> app-present: `app/` appears
- app-present -> launcher-ready: main startup file exists (`main.py` or `webui-user.bat`)
- launcher-ready -> service-live: expected port answers
- service-live -> execution-capable: adapter succeeds
- execution-capable -> production-ready: preview/v1/final + QA outputs exist

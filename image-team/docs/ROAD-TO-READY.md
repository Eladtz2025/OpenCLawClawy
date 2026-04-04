# ROAD-TO-READY

The system is now beyond pure planning. It has:
- orchestration
- honesty gating
- capability detection
- environment reporting
- service probing
- a real Forge-compatible execution adapter
- execution attempt logging (`execution.json`)

What still blocks ready state on this machine:
1. A runnable local engine instance must exist
2. That engine must answer on a compatible API or be launchable from a verified local path
3. The runner must complete one successful real image job

Current observed blocker:
- Comfy recipe exists under Pinokio example path and is now the preferred engine, but `app/` is missing, so bring-up cannot start yet.
- Forge also exists only as a recipe/example path.

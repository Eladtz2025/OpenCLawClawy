# OPERATIONS

## What exists now
- Team structure
- Job scaffold
- Workflow planner
- Engine detector
- Status exporter
- Smoke-tested runner

## Current limitation
Execution stage is not yet wired to a verified local image engine.
The system is intentionally honest: it creates real run folders and planning artifacts, but it does not fake image outputs.

## Standard flow
1. Create a job with `run-image-team.ps1`
2. Detect local engines
3. Build workflow plan
4. Save handoff + workflow notes
5. Wire selected engine for actual generation/editing
6. Save QA + exports

## Example
```powershell
powershell -ExecutionPolicy Bypass -File .\image-team\scripts\run-image-team.ps1 `
  -Request "Edit portrait, keep identity, change background to modern office" `
  -JobName "office-portrait" `
  -Type "edit" `
  -SourceImage "C:\path\source.jpg" `
  -ReferenceImage "C:\path\ref.jpg"
```

## Next wiring targets
1. ComfyUI API / workflow JSON execution
2. InvokeAI CLI/API fallback
3. Forge/A1111 fallback execution
4. Optional identity-node capability detection

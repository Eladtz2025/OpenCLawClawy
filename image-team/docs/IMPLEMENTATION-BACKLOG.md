# IMPLEMENTATION-BACKLOG

## Phase 1 - done
- [x] Create project skeleton
- [x] Define role contract
- [x] Define output contract
- [x] Build engine detector
- [x] Build planner
- [x] Build runner
- [x] Smoke test job creation

## Phase 2 - next
- [ ] Detect runnable ComfyUI instance or launch path
- [ ] Add ComfyUI workflow templates
- [ ] Add execution adapter for ComfyUI API
- [ ] Add identity-node capability check (InstantID / PuLID / PhotoMaker)
- [ ] Save preview / v1 / final artifacts
- [x] Add production-readiness gate so the system cannot claim completion without real outputs
- [x] Add engine adapter placeholder with explicit not-wired state
- [x] Add Forge-compatible execution adapter that activates only when a local service is actually live
- [x] Add local service probing and execution-status reporting

## Phase 3
- [ ] Add InvokeAI fallback
- [ ] Add Forge/A1111 fallback
- [ ] Add inpainting mask routing
- [ ] Add side-by-side QA helper

## Phase 4
- [ ] One-command production run
- [ ] Better prompt presets by task type
- [ ] Reproducible settings snapshots

# Organizer V2

## Goal
Build 3 real parallel pipelines with one orchestrator:
1. Computer Cleanup
2. Gmail Cleanup
3. Google Photos Cleanup

All three must support: scan -> classify -> approval package -> execute -> verify.

## Architecture

### 1. Orchestrator
- Single state file per run
- Tracks status of each pipeline: pending/running/blocked/needs_auth/ready_for_approval/done
- Sends updates to Organizer topic
- Never claims background work unless a real task/session is active

### 2. Computer Pipeline
- Scope 1: `C:\Users\Itzhak`
- Scope 2 optional: whole machine
- Modules:
  - empty dirs / zero-byte / cold files
  - process snapshot + repeated CPU/RAM sampling
  - app-specific cleanup classification
- Output:
  - safe-delete package
  - archive package
  - manual-review package

### 3. Gmail Pipeline
- Real OAuth in user session
- Queries:
  - large messages
  - old low-value mail
  - newsletters/promotions
  - unsubscribe candidates
- Output:
  - delete package
  - archive package
  - unsubscribe package

### 4. Photos Pipeline
- `credentials.json` + token flow
- Access validation first
- Then:
  - library inventory
  - junk candidates
  - family whitelist flow
  - album proposal flow
- Output:
  - review/delete package
  - album proposal package

## Blocking Conditions To Solve
1. Gmail auth must complete in the real user session, not systemprofile.
2. Photos token flow must complete successfully from the same real session.
3. Computer pipeline needs stronger app-aware classifiers, not only generic old-file filters.
4. Topic-based reporting should be the main control surface.

## Build Order
1. Create `organizer/` project folder
2. Add orchestrator state + config
3. Add computer pipeline scripts
4. Add Gmail auth bootstrap + audit runner
5. Add Photos auth bootstrap + audit runner
6. Add topic reporting hooks
7. Test each pipeline alone
8. Test parallel run

## Success Definition
- All 3 pipelines can run independently
- Orchestrator can run them together
- Each pipeline produces approval packages
- No silent failure
- All updates go to Organizer topic

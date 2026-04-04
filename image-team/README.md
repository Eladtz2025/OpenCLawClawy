# Image Team

Local-only image generation and editing system for OpenClaw.

## Mission
Build a coordinated 4-role team that plans, preserves identity, executes local image workflows, and performs QA/export.

## Team Roles
1. Prompt & Workflow Planning Specialist
2. Identity Preservation Specialist
3. Image Generation / Editing Specialist
4. QA & Export Specialist

## Scope
- txt2img
- img2img
- inpainting
- outpainting
- portrait-preserving edit
- style transfer
- enhancement / upscale / cleanup

## Constraints
- Local/self-hosted tools only
- No paid APIs
- No cloud generation services
- Never overwrite originals
- Preserve identity when real faces are involved

## Directory Layout
- `config/` - engine detection and defaults
- `templates/` - handoff, prompts, QA templates
- `runs/` - per-job folders
- `outputs/` - exported deliverables
- `scripts/` - orchestration utilities
- `docs/` - operating notes

## First goal
Provide a reliable orchestrator and file contract even before the final local engine wiring is complete.

## Current preferred engine
ComfyUI/Comfy is now the primary detected route when present, matching the original system requirement.

## Honesty gate
This project must not be declared complete until a verified local engine produces real preview, v1, and final image outputs.

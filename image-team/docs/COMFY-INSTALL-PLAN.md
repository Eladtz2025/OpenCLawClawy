# COMFY-INSTALL-PLAN

The project can now derive a concrete local install plan for Comfy from the Pinokio recipe.

## Current chosen path
- Engine: Comfy
- Install mode: CPU-safe plan
- Source of truth: local Pinokio recipe files (`install.js`, `torch.js`, `hf.json`)

## Planned steps
1. Clone ComfyUI into `app`
2. Clone workflow examples
3. Clone ComfyUI-Manager
4. Install requirements with `uv`
5. Install bitsandbytes
6. Install CPU torch stack
7. Download a base checkpoint

## Important
This plan is local and reproducible, but not yet auto-executed by the runner.
The runner now generates this plan automatically per job when Comfy is selected and install preflight passes.

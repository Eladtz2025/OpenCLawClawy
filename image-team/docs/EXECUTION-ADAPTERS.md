# EXECUTION-ADAPTERS

## Implemented now
- Forge/A1111-compatible txt2img API adapter
- Execution probe that runs only when a local service is actually detected on port 7860

## Current behavior
- If no local service is live, execution is skipped honestly
- If Forge-compatible API is live, the runner can export:
  - `image_preview.png`
  - `image_v1.png`
  - `image_final.png`
  - `used_prompt.txt`
  - `qa/qa_report.txt`

## Next upgrades
- img2img adapter
- inpainting adapter
- identity-preserving workflow routing
- actual visual QA pass after image generation

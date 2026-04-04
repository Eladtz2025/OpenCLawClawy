# WORKFLOW-ASSETS

The project now stores workflow-side assets for future Comfy execution:
- `templates/comfy-txt2img-workflow.json`
- `templates/comfy-portrait-preserve-workflow.json`
- per-job `workflow-template.json`
- per-job `workflow-inputs.json`

These are not yet live Comfy prompt graphs.
They are contracts that let the orchestration layer stay stable until the real Comfy app/API exists.
They are generated automatically into each run folder by the runner.

This means the team can already package:
- prompt
- negative prompt
- identity method
- recommended settings
- core dimensions/steps/cfg/seed

When Comfy becomes runnable, these contracts can be replaced by real prompt-graph JSON with minimal disruption to the runner.

# SYSTEM-SPEC

## Required Response Format
Every completed job should be representable as:

- STATUS: SUCCESS | PARTIAL | FAILED
- TEAM_ROLE_FLOW
- TOOLS_USED
- INPUTS
- WORKING_FILES
- OUTPUT_FILES
- ACTIONS_TAKEN
- QUALITY_NOTES
- PROBLEMS_FOUND
- NEXT_BEST_ACTION

## Internal Handoff Format
- HANDOFF_TO:
- TASK_SUMMARY:
- INPUT_FILES:
- EXPECTED_OUTPUTS:
- RISKS:
- NOTES:

## Primary Workflow Stages
1. Inspect request
2. Plan workflow
3. Preserve identity
4. Execute generation/edit
5. Run QA
6. Deliver package

## Tool Preference Order
1. ComfyUI
2. InstantID / PuLID / PhotoMaker when identity preservation is needed
3. InvokeAI
4. Forge
5. AUTOMATIC1111

## Approved Output Package
- `image_preview.*`
- `image_v1.*`
- `image_final.*`
- `used_prompt.txt`
- `workflow_notes.txt`
- `qa_report.txt`
- `side_by_side_notes.txt`

## Status Rules
SUCCESS only when real output files exist and the request was fulfilled.
PARTIAL when output exists but quality / likeness / completeness is not strong enough.
FAILED when inputs are missing or no usable output was produced.

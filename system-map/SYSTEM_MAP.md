# SYSTEM_MAP

Professional, conservative mapping and review of detected OpenClaw systems.

## Summary

- Systems: 8
- Heavy: 1
- Needs cleanup: 4
- Near 10/10: 0

## Clawy Runtime

- owner: Itzhak
- purpose: Primary OpenClaw runtime for Clawy.
- status: active
- overall_score: 5.7/10 (weak)
- weight: moderate
- recommendation: improve later
- needs_cleanup: yes
- needs_redesign: no
- workspace_path: C:\Users\Itzhak\.openclaw\workspace
- action_link: https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html
- short_summary: Stable runtime, weak safety.
- key_risks: open group access, full exec, config residue
- score_explanations: architecture=Reasonable structure, weak exposure control.; clarity=Understandable, but not clean enough.; safety=Open group with full exec is unsafe.

## PC Guardian

- owner: Itzhak
- purpose: PC monitoring and guardian system.
- status: unknown
- overall_score: 6.3/10 (acceptable)
- weight: light
- recommendation: manual review
- needs_cleanup: no
- needs_redesign: no
- workspace_path: C:\Users\Itzhak\.openclaw\workspace\pc-guardian
- action_link: https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html
- short_summary: Looks real, not fully verified yet.
- key_risks: scope not fully verified, needs clearer boundaries
- score_explanations: architecture=Folder is clearly isolated.; clarity=Name and scope are readable.; safety=No direct unsafe exposure found here.

## System Map

- owner: Itzhak
- purpose: OpenClaw system mapping and review dashboard.
- status: active
- overall_score: 7.3/10 (acceptable)
- weight: light
- recommendation: improve later
- needs_cleanup: no
- needs_redesign: no
- workspace_path: C:\Users\Itzhak\.openclaw\workspace\system-map
- action_link: https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html
- short_summary: Active and useful, still being refined.
- key_risks: mapping still evolving, depends on conservative inference
- score_explanations: architecture=Simple local structure.; clarity=Readable model and output files.; safety=Read-only style is safer.

## News Editor

- owner: Itzhak
- purpose: News collection, editing and dashboarding system.
- status: active
- overall_score: 8.5/10 (strong)
- weight: moderate
- recommendation: maintain
- needs_cleanup: no
- needs_redesign: no
- workspace_path: C:\Users\Itzhak\.openclaw\workspace\news-dashboard
- action_link: unknown
- short_summary: Highly active, well-documented and functional content pipeline.
- key_risks: dependency on live-pipeline stability
- score_explanations: architecture=Solid pipeline with clear stages.; clarity=Excellent documentation and output.; safety=Isolated and controlled.

## Image Generator

- owner: Itzhak
- purpose: Image generation workflow system.
- status: unknown
- overall_score: 4.9/10 (weak)
- weight: heavy
- recommendation: needs cleanup
- needs_cleanup: yes
- needs_redesign: no
- workspace_path: C:\Users\Itzhak\.openclaw\workspace\image-team
- action_link: unknown
- short_summary: Looks useful, but residue is visible.
- key_risks: old run residue, unclear current activity
- score_explanations: architecture=Project exists but not fully structured in current map.; clarity=Intent is visible, operation is not.; safety=No major exposure found.

## Pinch Runtime

- owner: Openclaw
- purpose: Primary OpenClaw runtime for Pinch.
- status: active
- overall_score: 5.4/10 (weak)
- weight: moderate
- recommendation: manual review
- needs_cleanup: yes
- needs_redesign: no
- workspace_path: C:\Users\Openclaw\.openclaw\workspace
- action_link: https://eladtz2025.github.io/OpenCLawClawy/system-map/dashboard.html
- short_summary: Usable runtime, but safety needs work.
- key_risks: open group access, full exec, unverified fallback
- score_explanations: architecture=Basic structure is okay.; clarity=Management clarity is only medium.; safety=Same unsafe exposure profile.

## Transcribe

- owner: Openclaw
- purpose: Transcription workflow system.
- status: unknown
- overall_score: 5.9/10 (weak)
- weight: moderate
- recommendation: manual review
- needs_cleanup: no
- needs_redesign: no
- workspace_path: C:\Users\Openclaw\.openclaw\workspace\transcription-team
- action_link: unknown
- short_summary: Present, but needs verification.
- key_risks: workflow not verified, possible stale outputs
- score_explanations: architecture=Folder is isolated enough.; clarity=Purpose is readable.; safety=No direct unsafe exposure found.

## Posts, Facebook and Instagram

- owner: Openclaw
- purpose: Social posts production workflow, likely for Facebook and Instagram.
- status: unknown
- overall_score: 5.3/10 (weak)
- weight: moderate
- recommendation: manual review
- needs_cleanup: no
- needs_redesign: yes
- workspace_path: C:\Users\Openclaw\.openclaw\workspace\video-editor-team
- action_link: unknown
- short_summary: Likely social content pipeline, still needs confirmation.
- key_risks: exact scope inferred conservatively, workflow not verified
- score_explanations: architecture=Project exists, but mapping is still inferred.; clarity=Name does not fully match the business label.; safety=No obvious unsafe exposure found.

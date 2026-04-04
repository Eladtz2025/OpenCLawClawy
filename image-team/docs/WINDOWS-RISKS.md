# WINDOWS-RISKS

## Current verified state
Current direct registry check returns:
`LongPathsEnabled = 1`

## Note on earlier logs
Older Pinokio logs captured a historical state with `LongPathsEnabled = 0`.
The project should trust fresh direct checks over stale logs.

## Why it matters
Many local AI stacks on Windows create very deep paths:
- Python envs
- model repos
- extension folders
- node/custom-node trees

With long paths enabled, this specific blocker is currently reduced.

## Impact on image-team readiness
This is no longer the active blocker.
The active blocker remains the missing runnable app under the detected Forge recipe path.

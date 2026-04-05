# PREFLIGHT

The system now distinguishes three separate states:
- installPossible
- bringupPossible
- executionPossible

This matters because a machine may have enough local tooling to install an engine recipe, but still lack:
- the cloned app directory
- the startup file
- a live local service

Per run, preflight results are written to:
- `install-toolchain.json`
- `preflight.json`

Current observed result on this machine:
- Python: present
- Git: present
- uv: missing at expected Pinokio path
- huggingface-cli: missing at expected Pinokio path

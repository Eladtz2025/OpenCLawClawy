# INSTALL-TOOLCHAIN

The project checks for the local Pinokio-side install toolchain:
- Python
- Git
- uv
- optional huggingface-cli

This does not automatically perform installation.
It only tells the team whether local installation is technically plausible from the current machine state.

Current observed state on this machine:
- Pinokio Python: present
- Pinokio Git: present
- Pinokio uv: not found at expected path
- huggingface-cli: not found at expected path

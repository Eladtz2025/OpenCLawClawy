# BRINGUP-PLAN

## Purpose
Convert detected local recipes into runnable services.

## Forge via Pinokio example
Detected root:
`C:\pinokio\prototype\system\examples\stable-diffusion-webui-forge`

Bring-up prerequisites:
1. `app/` exists
2. `app/webui-user.bat` exists
3. required model files exist
4. service starts and answers on 7860

## Current system support
- Detect whether bring-up is even possible
- Generate a structured bring-up assessment
- Keep execution honest until service is real

## Remaining step
Once `app/webui-user.bat` exists, the next implementation step is to add a managed background launcher and then re-run the execution probe.

## Current observed state
- `app/` missing
- `webui-user.bat` missing because `app/` is missing
- bring-up currently blocked before launch stage

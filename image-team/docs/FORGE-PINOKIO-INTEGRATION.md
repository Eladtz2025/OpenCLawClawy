# FORGE-PINOKIO-INTEGRATION

## What was verified
A Pinokio Forge example exists at:
`C:\pinokio\prototype\system\examples\stable-diffusion-webui-forge`

It contains:
- `install.js`
- `start.js`
- `pinokio.js`
- `README.md`

## Startup contract discovered
- Install clones repo into `app`
- Start runs `webui-user.bat` inside `app`
- URL is parsed from stdout using `http://[0-9.:]+`

## Important reality check
This is not yet proof that Forge is installed and runnable.
It is proof that a local startup recipe exists.
Production readiness still requires:
1. `app/` to exist
2. models to exist
3. service to launch successfully
4. preview/v1/final outputs to be produced by the image-team runner

## Adapter target
If this path becomes runnable, the image-team engine adapter should:
1. launch Forge if not already serving
2. detect service URL
3. call compatible txt2img/img2img endpoints
4. save preview/v1/final outputs into the active job folder
5. write QA artifacts

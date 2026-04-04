# COMFY-PINOKIO-INTEGRATION

## What was verified
A Pinokio Comfy example exists at:
`C:\pinokio\prototype\system\examples\comfy`

It contains:
- `install.js`
- `start.js`
- `pinokio.js`
- `README.md`

## Startup contract discovered
- Install clones repo into `app`
- Install creates/uses `app/env`
- Start runs `python main.py` inside `app`
- URL is parsed from stdout using a regex matching `starting server ... http://host:port`

## Interesting capability note
The install recipe links a `photomaker` model path into `app/models/photomaker`.
That does not prove PhotoMaker is installed, but it makes Comfy the strongest long-term primary route for identity-aware workflows on this machine.

## Current reality
As with Forge, this is currently only a recipe path until `app/` actually exists.

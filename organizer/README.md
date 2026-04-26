# Organizer V2

This folder is the new runtime root for the Organizer system.

## Pipelines
- computer
- gmail
- photos

## Current status
See `state/organizer-state.json`.

## Goal
Run 3 parallel pipelines with real state, approval packages, and topic-based reporting.

## Entry point
- `scripts/run-organizer.ps1` updates pipeline state and rebuilds current reports.
- `scripts/queue-organizer-run.ps1` creates a new run-to-completion job.
- `scripts/continue-organizer.ps1` advances the active run by one real phase.
- `scripts/build-computer-report.ps1` rebuilds the computer report from the latest disk audit artifacts.

## Continuation model
- `state/run-queue.json` tracks active, pending, and completed runs.
- `state/continuation-state.json` tracks the current phase and loop status.
- A session-bound cron job continues Organizer every 5 minutes.

## Reports
- `reports/run-summary.md`
- `reports/continuation-summary.md`
- `reports/computer-latest.md`
- `reports/gmail-latest.md`
- `reports/photos-latest.md`

# Photos approval package

Generated: 2026-05-03T06:58:53.096577+00:00
Items: 4
contractSha1: 1ca6d92ca74576ce82a23130b1de07879528ea6f

## Approved album operations

| kind | action |
|------|--------|
| group-screenshots | create-album-and-add-from-search:Screenshots |
| group-downloaded | create-album-and-add-from-search:Downloaded |
| group-old-pre-2020 | create-album-and-add-from-search:Pre-2020 |
| flag-near-duplicates | mark-only |

## Safety rules

- Apply mode performs ONLY album-add operations and tag/label-style metadata.
- Never delete media. Never remove from existing albums without explicit per-item approval.
- Each item must be in the approval package to be applied.
- Apply default is dry-run.

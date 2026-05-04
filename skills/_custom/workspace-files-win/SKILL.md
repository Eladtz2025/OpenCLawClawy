---
name: workspace-files-win
description: Windows-correct sandboxed file ops inside C:\Users\Itzhak\.openclaw\workspace. Replacement for the broken third-party "workspace-files" skill which hard-codes a Linux path.
---

# workspace-files-win

## Why
The third-party `workspace-files` skill has a hard-coded sandbox of
`/home/cmart/.openclaw/workspace` (Linux). On this Windows machine it
silently does nothing useful. This skill is the local replacement.

## Sandbox

All operations are constrained to:

```
C:\Users\Itzhak\.openclaw\workspace
```

Any attempt to read/write outside that root is refused.

## How to invoke

```powershell
node "C:\Users\Itzhak\.openclaw\workspace\skills\_custom\workspace-files-win\scripts\wf.js" <verb> [args...]
```

Verbs:

| Verb     | Args                          | Behavior |
|----------|-------------------------------|----------|
| `list`   | `<dir>`                       | List entries (one per line) inside sandbox dir. |
| `read`   | `<file>`                      | Print file contents (utf8). |
| `write`  | `<file>`                      | Write stdin contents to file (utf8). |
| `exists` | `<path>`                      | Print `true` or `false`. |
| `mkdir`  | `<dir>`                       | Recursive mkdir. |
| `stat`   | `<path>`                      | Print JSON: { exists, type, size, mtime }. |

All paths may be relative (resolved against the sandbox root) or
absolute (must lie under the sandbox root).

## Examples

```powershell
node ...\wf.js list news-dashboard
node ...\wf.js read news-dashboard/daily-summary.json
node ...\wf.js stat organizer/state/organizer-state.json
echo "note" | node ...\wf.js write tmp/test.txt
```

## Hard limits

- No deletes.
- No moves (use a separate explicit script if needed).
- No symlink traversal outside sandbox (resolved via realpath).
- No streaming binary write — utf8 only.

If you need a write outside the sandbox, do it explicitly with `Edit`
or `Write` after thinking about why.

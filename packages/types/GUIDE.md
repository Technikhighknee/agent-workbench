---
name: types
tagline: "Fast type checking. Never hangs, always answers in <5s."
---

# types

**Check types after every edit.** Fast, single-file focused.

## Start Here

```
check_file({ file: 'src/api.ts' })
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Type check | `tsc --noEmit` (slow, can hang) | `check_file` always <5s |
| Hover info | Read whole file | `get_type` at position |
| Find definition | Grep (wrong matches) | `go_to_definition` exact |

## Quick Reference

| Task | Tool |
|------|------|
| Check for errors | `check_file` |
| Type at position | `get_type` |
| Go to definition | `go_to_definition` |
| Get quick fixes | `get_quick_fixes` |

## Workflows

### After Every Edit
```
check_file({ file: 'src/edited.ts' })
```

### Understand Unknown Code
```
get_type({ file: 'src/api.ts', line: 42, column: 10 })
go_to_definition({ file: 'src/api.ts', line: 42, column: 10 })
```

### Fix Type Errors
```
check_file({ file: 'src/api.ts' })
get_quick_fixes({ file: 'src/api.ts', line: 10, column: 5 })
```

## Design

- Single file focus - optimized for ONE file at a time
- Stateless - reads fresh every time
- 5 second timeout - never hangs
- For project-wide: use `tsc --noEmit` via task-runner

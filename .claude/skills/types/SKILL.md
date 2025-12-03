---
name: types
description: "Fast type checking for single files. Never hangs, always answers in <5s."
allowed-tools: mcp__types__check_file, mcp__types__get_type, mcp__types__go_to_definition, mcp__types__get_quick_fixes
---

# types

**Single-file type checking that never hangs. All operations complete in <5 seconds.**

## First: check_file

After EVERY edit, verify types:
```
check_file({ file: 'src/edited.ts' })
```

## Quick Reference

| Task | Tool |
|------|------|
| Check for errors | `check_file` |
| What type is this? | `get_type` |
| Where is this defined? | `go_to_definition` |
| Auto-fix an error | `get_quick_fixes` |

## Design Philosophy

- **Single file focus** - optimized for checking ONE file at a time
- **No state** - reads fresh from disk every time, never stale
- **5 second timeout** - fails fast, never hangs
- **For project-wide checks** - use `tsc --noEmit` via task_runner

## Common Workflows

### After Every Edit
```
check_file({ file: 'src/api.ts' })
```

### Understanding Unknown Code
```
get_type({ file: 'src/api.ts', line: 42, column: 15 })
go_to_definition({ file: 'src/api.ts', line: 42, column: 15 })
```

### Fixing Type Errors
```
check_file({ file: 'src/broken.ts' })
get_quick_fixes({ file: 'src/broken.ts', line: 10, column: 5 })
```

### Project-Wide Checks
```
task_run({ command: 'tsc --noEmit' })
```

## Integration

Run `check_file` after using `syntax.edit_symbol` to verify your changes.

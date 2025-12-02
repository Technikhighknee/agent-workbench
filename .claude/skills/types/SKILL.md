---
name: types
description: "Type errors you can act on, not parse. IDE-quality intelligence."
allowed-tools: mcp__types__get_diagnostics, mcp__types__get_type_at_position, mcp__types__go_to_definition, mcp__types__find_type_references, mcp__types__get_quick_fixes, mcp__types__notify_file_changed, mcp__types__reload
---

# types

**Type checking that gives you file:line:column with the actual error. No parsing tsc output.**

## First: get_diagnostics

After EVERY edit, verify types:
```
get_diagnostics({ file: 'src/edited.ts' })
```

## Why This Wins

| The Problem | Built-in Failure | types Solution |
|-------------|------------------|----------------|
| Check types | tsc output is noisy, needs parsing | `get_diagnostics` returns structured errors |
| Understand a type | Read code and guess | `get_type_at_position` = IDE hover |
| Find definition | Grep finds wrong matches | `go_to_definition` is precise |
| Find usages | Grep matches strings/comments | `find_type_references` is semantic |

## Quick Reference

| Task | Tool |
|------|------|
| Check for errors | `get_diagnostics` |
| What type is this? | `get_type_at_position` |
| Where is this defined? | `go_to_definition` |
| Who uses this type? | `find_type_references` |
| Auto-fix an error | `get_quick_fixes` |
| Sync after edit | `notify_file_changed` |

## Common Workflows

### After Every Edit
```
get_diagnostics({ file: 'src/api.ts' })
```

### Understanding Unknown Code
```
get_type_at_position({ file: 'src/api.ts', line: 42, column: 15 })
go_to_definition({ file: 'src/api.ts', line: 42, column: 15 })
```

### Fixing Type Errors
```
get_diagnostics({ errors_only: true })
get_quick_fixes({ file: 'src/broken.ts', line: 10, column: 5 })
```

### Before Refactoring
```
find_type_references({ file: 'src/types.ts', line: 5, column: 10 })
```

## Integration

Run `get_diagnostics` after using `syntax.edit_symbol` to verify your changes didn't break types.

## Supports
TypeScript, JavaScript with JSDoc

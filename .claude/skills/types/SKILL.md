---
name: types
description: TypeScript type checking. Get errors, hover info, go-to-definition. Verify edits didn't break types.
allowed-tools: mcp__types__get_diagnostics, mcp__types__get_type_at_position, mcp__types__go_to_definition, mcp__types__find_type_references, mcp__types__get_quick_fixes, mcp__types__notify_file_changed, mcp__types__reload
---

# types

**TypeScript language service.** Type errors, hover info, definitions. Know if code compiles.

## Tools

| Tool | Purpose |
|------|---------|
| `get_diagnostics` | Type errors for file or project |
| `get_type_at_position` | Hover info at line:column |
| `go_to_definition` | Jump to where symbol is defined |
| `find_type_references` | All usages (type-aware) |
| `get_quick_fixes` | Available fixes for errors |
| `notify_file_changed` | Sync after edits |
| `reload` | Re-discover tsconfig.json files |

## Quick Examples

```
get_diagnostics({})                          // All project errors
get_diagnostics({ file: 'src/api.ts' })      // Single file
get_diagnostics({ errors_only: true })       // Skip warnings

get_type_at_position({ file: 'src/api.ts', line: 42, column: 10 })
go_to_definition({ file: 'src/api.ts', line: 42, column: 10 })

notify_file_changed({ file: 'src/api.ts' })  // After editing
get_diagnostics({ file: 'src/api.ts' })      // Re-check

reload({})                                    // After adding new packages
```

## Workflow

1. Make edits with `edit_symbol` or `Edit`
2. `notify_file_changed` to sync
3. `get_diagnostics` to verify no type errors
4. `get_quick_fixes` if errors exist

**Auto-initializes** from `tsconfig.json` in working directory.

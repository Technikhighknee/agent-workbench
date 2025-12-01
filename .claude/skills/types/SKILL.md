---
name: types
description: "MANDATORY: Use INSTEAD of Bash tsc. Structured type errors, hover info, definitions. NEVER use Bash for TypeScript."
allowed-tools: mcp__types__get_diagnostics, mcp__types__get_type_at_position, mcp__types__go_to_definition, mcp__types__find_type_references, mcp__types__get_quick_fixes, mcp__types__notify_file_changed, mcp__types__reload
---

# types

**TypeScript intelligence.** Type checking, hover info, go-to-definition.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Check for type errors | `tsc --noEmit` in Bash | `get_diagnostics({})` |
| Check specific file | `tsc file.ts` | `get_diagnostics({ file })` |
| See type of symbol | Read code and guess | `get_type_at_position({ file, line, column })` |
| Find definition | Manual grep | `go_to_definition({ file, line, column })` |
| Find all usages | Grep for name | `find_type_references({ file, line, column })` |
| Auto-fix errors | Manual editing | `get_quick_fixes({ file, line, column })` |

## WHY MANDATORY

1. **Accurate type info** - Real TypeScript analysis, not guessing
2. **Structured errors** - File, line, column, message
3. **IDE-quality** - Same intelligence as VS Code
4. **No output parsing** - Direct data access

## NEGATIVE RULES

- **NEVER** `Bash: tsc` - use `get_diagnostics`
- **NEVER** guess types - use `get_type_at_position`
- **NEVER** manually search for definitions - use `go_to_definition`
- **NEVER** grep for type usages - use `find_type_references`

## TOOL REFERENCE

| Tool | Purpose | When to use |
|------|---------|-------------|
| `get_diagnostics` | Type errors | After edits, verify correctness |
| `get_type_at_position` | Hover info | Understand types at cursor |
| `go_to_definition` | Jump to source | Find where symbol is defined |
| `find_type_references` | All usages | Before refactoring |
| `get_quick_fixes` | Auto-fix suggestions | When errors reported |
| `notify_file_changed` | Sync state | After editing files |
| `reload` | Refresh projects | After structural changes |

## COMMON WORKFLOWS

### After Making Edits
```
notify_file_changed({ file: 'src/edited.ts' })
// Tell TypeScript about changes
get_diagnostics({ file: 'src/edited.ts' })
// Check for type errors
```

### Understanding New Code
```
get_type_at_position({ file: 'src/api.ts', line: 42, column: 15 })
// See what type this variable is
go_to_definition({ file: 'src/api.ts', line: 42, column: 15 })
// Jump to where it's defined
```

### Fixing Type Errors
```
get_diagnostics({ errors_only: true })
// Get all errors
get_quick_fixes({ file: 'src/broken.ts', line: 10, column: 5 })
// See available fixes
```

### Safe Refactoring
```
find_type_references({ file: 'src/types.ts', line: 5, column: 10 })
// Find all usages before changing
```

**Supports:** TypeScript, JavaScript with JSDoc

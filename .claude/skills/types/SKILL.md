---
name: types
description: "MANDATORY: Use INSTEAD of Bash tsc. Structured type errors, hover info, definitions. NEVER use Bash for TypeScript."
allowed-tools: mcp__types__get_diagnostics, mcp__types__get_type_at_position, mcp__types__go_to_definition, mcp__types__find_type_references, mcp__types__get_quick_fixes, mcp__types__notify_file_changed, mcp__types__reload
---

# types

**TypeScript language service.** Type errors, hover info, definitions. Know if code compiles.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Check for type errors | `Bash: npx tsc --noEmit` | `get_diagnostics({})` |
| Check single file for errors | `Bash: npx tsc file.ts` | `get_diagnostics({ file: 'file.ts' })` |
| Understand a type | Read source + guess | `get_type_at_position({ file, line, column })` |
| Find where symbol is defined | `Grep` for definition | `go_to_definition({ file, line, column })` |
| Find all usages (type-aware) | `Grep` for name | `find_type_references({ file, line, column })` |
| Fix a type error | Manual fix | `get_quick_fixes({ file, line, column })` |

## WHY MANDATORY

- `get_diagnostics` returns **STRUCTURED errors** with file, line, column, message
- `Bash: tsc` returns **raw text** with ANSI codes, requires parsing
- `find_type_references` is **TYPE-AWARE** - won't match unrelated same-name symbols
- `get_quick_fixes` provides **APPLICABLE FIXES** the language server suggests

## NEGATIVE RULES

- **NEVER** use `Bash: tsc` for type checking - use `get_diagnostics`
- **NEVER** use `Grep` for type usages - use `find_type_references`
- **NEVER** guess types from context - use `get_type_at_position`
- **NEVER** manually trace definitions - use `go_to_definition`

## MANDATORY WORKFLOW

After **EVERY** code edit in TypeScript:
1. `notify_file_changed({ file })` - Sync the language server
2. `get_diagnostics({ file })` - Verify no type errors introduced
3. If errors: `get_quick_fixes({ file, line, column })` - Get suggested fixes

## WHEN TO RELOAD

Use `reload({})` when:
- New packages added to monorepo
- New `tsconfig.json` created
- Project structure changed

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

**Auto-initializes** from `tsconfig.json` in working directory.

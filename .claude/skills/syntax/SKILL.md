---
name: syntax
description: Edit code by function name, not line numbers. No fragile string matching. Auto-indexed. (project)
allowed-tools: mcp__syntax__list_symbols, mcp__syntax__read_symbol, mcp__syntax__edit_symbol, mcp__syntax__edit_lines, mcp__syntax__get_imports, mcp__syntax__get_exports, mcp__syntax__search_symbols, mcp__syntax__find_references, mcp__syntax__rename_symbol, mcp__syntax__get_callers, mcp__syntax__get_callees, mcp__syntax__analyze_deps
---

# syntax

**Edit by name, not line number.** Auto-indexed. Always current.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| See what's in a source file | `Read` then scan | `list_symbols({ file_path })` |
| Read a specific function/method | `Read` whole file | `read_symbol({ file_path, name_path: 'Class/method' })` |
| Edit a function/method | `Edit` with string matching | `edit_symbol({ file_path, name_path, new_body })` |
| Edit specific lines | `Edit` with context guessing | `edit_lines({ file_path, start_line, end_line, new_content })` |
| Find a function definition | `Grep` for `function foo` | `search_symbols({ pattern: 'foo' })` |
| Find all usages of a symbol | `Grep` for the name | `find_references({ symbol_name })` |
| Rename across codebase | `Grep` + multiple `Edit` | `rename_symbol({ old_name, new_name })` |
| Understand file imports | `Read` top of file | `get_imports({ file_path })` |
| Understand file exports | `Read` and scan | `get_exports({ file_path })` |
| Find who calls a function | `Grep` for function name | `get_callers({ symbol_name })` |
| Find what a function calls | `Read` and trace manually | `get_callees({ file_path, symbol_name_path })` |
| Check for circular deps | Manual analysis | `analyze_deps({})` |

## WHY MANDATORY

- `Edit` with string matching **FAILS** when code has similar patterns
- `Grep` for usages **MISSES** aliased imports and **INCLUDES** false positives
- `rename_symbol` is **ATOMIC** - either all references update or none do
- `read_symbol` saves **90% context** vs reading whole files

## NEGATIVE RULES

- **NEVER** use `Read` to find a function when you know its name
- **NEVER** use `Edit` for function modifications - use `edit_symbol`
- **NEVER** use `Grep` for "find all usages" - use `find_references`
- **NEVER** manually trace call graphs - use `get_callers`/`get_callees`

## Tools

| Tool | Purpose |
|------|---------|
| `list_symbols` | See file structure |
| `read_symbol` | Read `Class/method` by name |
| `edit_symbol` | Replace entire symbol |
| `edit_lines` | Replace line range |
| `get_imports` / `get_exports` | Module boundaries |
| `search_symbols` | Find by pattern |
| `find_references` | All usages |
| `rename_symbol` | Rename across codebase (dry_run available) |
| `get_callers` / `get_callees` | Call graph |
| `analyze_deps` | Circular dependency detection |

## Quick Examples

```
list_symbols({ file_path: 'src/service.ts' })
read_symbol({ file_path: 'src/service.ts', name_path: 'UserService/create' })
edit_symbol({ file_path: '...', name_path: 'UserService/create', new_body: '...' })
rename_symbol({ old_name: 'foo', new_name: 'bar', dry_run: true })
get_callers({ symbol_name: 'processData' })
analyze_deps({})
```

**Supports:** TypeScript, JavaScript, Python, Go, Rust

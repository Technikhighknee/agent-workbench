---
name: syntax
description: Edit code by function name, not line numbers. No fragile string matching. Auto-indexed.
allowed-tools: mcp__syntax__list_symbols, mcp__syntax__read_symbol, mcp__syntax__edit_symbol, mcp__syntax__edit_lines, mcp__syntax__get_imports, mcp__syntax__get_exports, mcp__syntax__search_symbols, mcp__syntax__find_references, mcp__syntax__rename_symbol, mcp__syntax__get_callers, mcp__syntax__get_callees, mcp__syntax__analyze_deps
---

# syntax

**Edit by name, not line number.** Auto-indexed. Always current.

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

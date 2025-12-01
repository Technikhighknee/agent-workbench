---
name: syntax
description: Use for symbol-aware code operations. Read and edit by function/class name instead of line numbers or exact string matching. Index projects for cross-file search and refactoring.
allowed-tools: mcp__syntax__list_symbols, mcp__syntax__read_symbol, mcp__syntax__edit_symbol, mcp__syntax__edit_lines, mcp__syntax__index_project, mcp__syntax__search_symbols, mcp__syntax__find_references, mcp__syntax__rename_symbol
---

# syntax

Symbol-aware code operations for AI agents. Read and edit code by function/class name, not line numbers.

## When to Use

- Understanding file structure before editing
- Reading specific functions/classes without loading entire file
- Replacing entire symbols (more reliable than string matching)
- Searching for symbols across a codebase
- Finding all usages of a function/class
- Renaming symbols across multiple files

## Tools

### File Operations (no index required)

| Tool | Description |
|------|-------------|
| `list_symbols` | Get file structure with line numbers |
| `read_symbol` | Read symbol by name path (e.g., `UserService/create`) |
| `edit_symbol` | Replace entire symbol by name |
| `edit_lines` | Replace line range |

### Project Operations (call `index_project` first)

| Tool | Description |
|------|-------------|
| `index_project` | Index all source files in a directory |
| `search_symbols` | Find symbols by pattern across all files |
| `find_references` | Find all usages of a symbol |
| `rename_symbol` | Rename symbol across codebase (supports dry_run) |

## Decision Tree

### Reading Code
- Know exact symbol → `read_symbol`
- Need file overview → `list_symbols`
- Need full file → built-in `Read`
- Searching across project → `index_project` then `search_symbols`
- Finding usages → `index_project` then `find_references`

### Editing Code
- Replacing entire function → `edit_symbol`
- Replacing line range → `edit_lines`
- Renaming across files → `index_project` then `rename_symbol`
- Small inline change → built-in `Edit`
- Unsupported language → built-in `Edit`

## Workflows

### Understand Then Edit
```
1. list_symbols({ file_path: 'src/service.ts' })
2. read_symbol({ file_path: 'src/service.ts', name_path: 'UserService/create' })
3. edit_symbol({ file_path: 'src/service.ts', name_path: 'UserService/create', new_body: '...' })
```

### Cross-file Refactoring
```
1. index_project({ root_path: '/path/to/project' })
2. find_references({ symbol_name: 'oldFunctionName' })
3. rename_symbol({ old_name: 'oldFunctionName', new_name: 'newFunctionName', dry_run: true })
4. rename_symbol({ old_name: 'oldFunctionName', new_name: 'newFunctionName' })
```

### Find Symbol Across Codebase
```
1. index_project({ root_path: '/path/to/project' })
2. search_symbols({ pattern: 'handle.*Request' })
```

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust

## Notes

- Name paths are hierarchical: `Class/method` or `module/function`
- Always call `index_project` before cross-file operations
- Use `dry_run: true` with `rename_symbol` to preview changes
- `list_symbols` with `depth: 0` gives only top-level symbols
- Complements built-in `Read`, `Edit`, `Grep`, `Glob`

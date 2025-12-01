---
name: syntax
description: Use for symbol-aware code operations. Read and edit by function/class name instead of line numbers or exact string matching. Auto-indexes the project and watches for changes.
allowed-tools: mcp__syntax__list_symbols, mcp__syntax__read_symbol, mcp__syntax__edit_symbol, mcp__syntax__edit_lines, mcp__syntax__search_symbols, mcp__syntax__find_references, mcp__syntax__rename_symbol, mcp__syntax__get_callers, mcp__syntax__get_callees
---

# syntax

Symbol-aware code operations for AI agents. Read and edit code by function/class name, not line numbers.

**Auto-indexing**: The project is automatically indexed on startup and watches for file changes. No manual indexing required.

## When to Use

- Understanding file structure before editing
- Reading specific functions/classes without loading entire file
- Replacing entire symbols (more reliable than string matching)
- Searching for symbols across a codebase
- Finding all usages of a function/class
- Renaming symbols across multiple files
- Understanding call hierarchy (who calls what)

## Tools

### File Operations

| Tool | Description |
|------|-------------|
| `list_symbols` | Get file structure with line numbers |
| `read_symbol` | Read symbol by name path (e.g., `UserService/create`) |
| `edit_symbol` | Replace entire symbol by name |
| `edit_lines` | Replace line range |

### Project Operations

| Tool | Description |
|------|-------------|
| `search_symbols` | Find symbols by pattern across all files |
| `find_references` | Find all usages of a symbol |
| `rename_symbol` | Rename symbol across codebase (supports dry_run) |
| `get_callers` | Find all functions that call a given function |
| `get_callees` | Find all functions called by a given function |

## Decision Tree

### Reading Code
- Know exact symbol → `read_symbol`
- Need file overview → `list_symbols`
- Need full file → built-in `Read`
- Searching across project → `search_symbols`
- Finding usages → `find_references`

### Understanding Code Flow
- What calls this function? → `get_callers`
- What does this function call? → `get_callees`

### Editing Code
- Replacing entire function → `edit_symbol`
- Replacing line range → `edit_lines`
- Renaming across files → `rename_symbol`
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
1. find_references({ symbol_name: 'oldFunctionName' })
2. rename_symbol({ old_name: 'oldFunctionName', new_name: 'newFunctionName', dry_run: true })
3. rename_symbol({ old_name: 'oldFunctionName', new_name: 'newFunctionName' })
```

### Understand Call Flow
```
1. get_callers({ symbol_name: 'processData' })  // Who calls processData?
2. get_callees({ file_path: 'src/service.ts', symbol_name_path: 'Service/processData' })  // What does it call?
```

### Find Symbol Across Codebase
```
search_symbols({ pattern: 'handle.*Request' })
```

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust

## Notes

- Name paths are hierarchical: `Class/method` or `module/function`
- Use `dry_run: true` with `rename_symbol` to preview changes
- `list_symbols` with `depth: 0` gives only top-level symbols
- Call hierarchy helps understand code flow without reading everything
- Index auto-updates when files change - always current
- Complements built-in `Read`, `Edit`, `Grep`, `Glob`

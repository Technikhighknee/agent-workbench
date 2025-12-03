# syntax

[← Back to packages](README.md) · [Source](../../packages/syntax/)

MCP server for symbol-aware code operations. Read and edit code by function/class name, not line numbers.

## Tools

| Tool | Description |
|------|-------------|
| `add_import` | Add import |
| `analyze_deps` | Analyze project dependencies and detect circular imports. |
| `apply_edits` | Apply multiple edits across files atomically. |
| `batch_edit_symbols` | Edit multiple symbols across files atomically. |
| `edit_lines` | Replace a range of lines by line number. |
| `edit_symbol` | Replace a symbol |
| `extract_function` | Extract a range of lines into a new function. |
| `find_dead_code` | Find functions/methods that are never called from any exported entry point. |
| `find_paths` | Find all paths between two symbols in the call graph. |
| `find_references` | Find all usages and references of a symbol throughout the codebase. |
| `find_unused_exports` | Find exports that are not imported anywhere in the codebase. |
| `get_callees` | Find all functions/methods called by a given symbol. |
| `get_callers` | Find all functions/methods that call a given symbol. |
| `get_exports` | Get all export statements from a source file. |
| `get_imports` | Get all import statements from a source file. |
| `inline_function` | Replace a function call with the function body. |
| `list_symbols` | List all symbols (functions, classes, etc. |
| `move_file` | Move a source file to a new location and update all imports across the codebase. |
| `move_symbol` | Move a symbol (function, class, interface, etc. |
| `organize_imports` | Sort and organize import statements in file(s). |
| `read_symbol` | Read a specific symbol |
| `remove_unused_imports` | Find and remove import statements that aren |
| `rename_symbol` | Rename a symbol (variable, function, class, etc. |
| `search_symbols` | Search for symbols by name pattern across all indexed files. |
| `trace` | Trace call chains forward (what does this call? |

## MCP Configuration

```json
{
  "syntax": {
    "command": "npx",
    "args": ["@agent-workbench/syntax"]
  }
}
```

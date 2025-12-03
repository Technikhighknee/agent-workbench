# syntax

[← Back to packages](README.md) · [Source](../../packages/syntax/)

Edit code by function name, not text matching. The Edit tool fails when text isn't unique. This never does.

## Tools

- `list_symbols`
- `read_symbol`
- `edit_symbol`
- `batch_edit_symbols`
- `search_symbols`
- `find_references`
- `rename_symbol`
- `move_file`
- `move_symbol`
- `get_callers`
- `get_callees`
- `trace`
- `find_dead_code`

## MCP Configuration

```json
{
  "syntax": {
    "command": "npx",
    "args": ["@agent-workbench/syntax"]
  }
}
```

See [GUIDE.md](../../packages/syntax/GUIDE.md) for full documentation.
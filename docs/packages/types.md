# types

[← Back to packages](README.md) · [Source](../../packages/types/)

MCP server for TypeScript language service integration. Get type errors, hover info, and go-to-definition.

## Tools

| Tool | Description |
|------|-------------|
| `check_file` | Check a single TypeScript file for type errors. |
| `get_quick_fixes` | Get available fixes for type errors at a position. |
| `get_type` | Get type information at a specific position in a TypeScript file. |
| `go_to_definition` | Find where a symbol is defined. |

## MCP Configuration

```json
{
  "types": {
    "command": "npx",
    "args": ["@agent-workbench/types"]
  }
}
```

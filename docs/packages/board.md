# board

[← Back to packages](README.md) · [Source](../../packages/board/)

A simple task board for AI agents - Trello-like MCP tools for managing work

## Tools

| Tool | Description |
|------|-------------|
| `board_add` | Create a new card. |
| `board_delete` | Remove card from board. |
| `board_get` | Get full card details by ID. |
| `board_list` | List cards with optional filtering. |
| `board_move` | Move card to different list. |
| `board_update` | Update card properties. |

## MCP Configuration

```json
{
  "board": {
    "command": "npx",
    "args": ["@agent-workbench/board"]
  }
}
```

# @agent-workbench/board

Task board for AI agents. Track work items with a Trello-like kanban board that persists across sessions.

## Why This Package?

AI agents need to track work across sessions:
- **What was I working on?** → `board_list` shows current board state
- **What's next?** → Filter by list to see `todo` or `in_progress`
- **Track progress** → Move cards through `backlog` → `todo` → `in_progress` → `done`
- **Prioritize work** → Cards have priority levels and labels
- **Persistent memory** → Board state survives session restarts

## Tools

| Tool | Description |
|------|-------------|
| `board_list` | List cards with optional filtering by list, labels, priority, or search |
| `board_add` | Create a new card with title, description, priority, labels |
| `board_update` | Update card properties (title, description, priority, labels) |
| `board_move` | Move a card to a different list |
| `board_get` | Get full details of a specific card |
| `board_delete` | Remove a card from the board |

## Installation

```bash
npm install @agent-workbench/board
```

## MCP Configuration

```json
{
  "mcpServers": {
    "board": {
      "command": "npx",
      "args": ["@agent-workbench/board"]
    }
  }
}
```

## Usage Examples

### View Current Board State
```
board_list { }
```
Returns all lists with card counts and all cards with their details.

### Filter Cards by List
```
board_list { "list": "in_progress" }
```
Shows only cards currently being worked on.

### Create a New Task
```
board_add {
  "title": "Implement user authentication",
  "description": "Add OAuth2 flow with Google provider",
  "list": "backlog",
  "priority": "high",
  "labels": ["feature", "security"]
}
```

### Move Card Through Workflow
```
board_move { "id": "abc123", "list": "in_progress" }
```
Start working on a card by moving it to in_progress.

### Update Card Details
```
board_update {
  "id": "abc123",
  "priority": "critical",
  "labels": ["feature", "security", "urgent"]
}
```

### Search for Cards
```
board_list { "search": "authentication" }
```
Find cards mentioning "authentication" in title or description.

## Default Lists

The board comes with a standard kanban workflow:

| List | Purpose |
|------|---------|
| `backlog` | Future work, not yet scheduled |
| `todo` | Ready to start |
| `in_progress` | Currently being worked on |
| `blocked` | Waiting on something |
| `done` | Completed |

## Card Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier (auto-generated) |
| `title` | string | Card title (required) |
| `description` | string | Markdown-supported description |
| `list` | string | Which list the card is in |
| `priority` | enum | `low`, `medium`, `high`, `critical` |
| `labels` | string[] | Tags for categorization |
| `createdAt` | ISO 8601 | When the card was created |
| `updatedAt` | ISO 8601 | When the card was last modified |

## Architecture

```
src/
├── core/
│   ├── model.ts         # Domain types (Card, Board, List)
│   ├── BoardService.ts  # Business logic
│   └── BoardStorage.ts  # JSON file persistence
├── tools/
│   └── registerTools.ts # MCP tool implementations
└── server.ts            # MCP server entry point
```

## Storage

Board data is stored in `.board/board.json` in the project root. This file:
- Is created automatically on first use
- Should be added to `.gitignore` (project-specific, not shared)
- Uses atomic writes to prevent corruption
- Supports schema migrations for future versions

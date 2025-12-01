# @agent-workbench/history

Git history operations for AI agents. Understand code evolution through blame, history, and commit search.

## Why This Package?

AI agents often need to understand not just *what* code does, but *why* it exists:
- **Why was this written this way?** → `blame_file` shows commit messages per line
- **What changed recently?** → `recent_changes` shows what's been modified
- **When was this added?** → `file_history` shows commits touching a file
- **Find related changes** → `search_commits` finds commits by message

## Tools

| Tool | Description |
|------|-------------|
| `blame_file` | Get git blame - who wrote each line and when |
| `file_history` | Get commits that touched a file |
| `recent_changes` | Get recently changed files |
| `commit_info` | Get details of a commit |
| `search_commits` | Search commits by message |
| `diff_file` | Get diff between commits |

## Installation

```bash
npm install @agent-workbench/history
```

## MCP Configuration

```json
{
  "mcpServers": {
    "history": {
      "command": "npx",
      "args": ["@agent-workbench/history"]
    }
  }
}
```

## Usage Examples

### Understanding Why Code Exists
```
blame_file { "file_path": "src/auth.ts" }
```
Returns who wrote each section and their commit messages explaining why.

### Finding Recent Changes
```
recent_changes { "count": 10 }
```
Shows what files changed in the last 10 commits - useful for debugging "what broke?"

### Tracing File Evolution
```
file_history { "file_path": "src/api.ts", "limit": 20 }
```
Shows all commits that modified a file, with authors and messages.

### Finding When Features Were Added
```
search_commits { "query": "authentication", "limit": 10 }
```
Finds commits mentioning "authentication" in their messages.

## Architecture

```
src/
├── core/
│   ├── model.ts      # Domain types (Commit, BlameResult, etc.)
│   └── GitService.ts # Git CLI wrapper
├── tools/            # MCP tool implementations
│   ├── blameFile.ts
│   ├── fileHistory.ts
│   └── ...
└── server.ts         # MCP server entry point
```

Follows the same architecture as `@agent-workbench/syntax` - clean separation of core domain logic from MCP tooling.

# history

[← Back to packages](README.md) · [Source](../../packages/history/)

MCP server for git history operations. Understand code evolution through blame, history, and commit search.

## Tools

| Tool | Description |
|------|-------------|
| `blame_file` | Get git blame for a file - shows who wrote each line and when. |
| `branch_diff` | Get summary of changes between branches - files changed, additions/deletions, commits ahead/behind. |
| `changed_symbols` | Get symbols (functions, classes, methods) that changed between git refs. |
| `commit_info` | Get details of a specific commit - message, author, files changed. |
| `diff_file` | Get diff of a file between two commits. |
| `file_history` | Get commits that touched a file - understand how code evolved. |
| `git_add` | Stage files for commit. |
| `git_commit` | Create a commit with staged changes. |
| `git_status` | Get current git status - branch, staged/unstaged changes, untracked files. |
| `recent_changes` | Get recently changed files across the repository. |
| `search_commits` | Search commits by message content - find when a feature or fix was added |

## MCP Configuration

```json
{
  "history": {
    "command": "npx",
    "args": ["@agent-workbench/history"]
  }
}
```

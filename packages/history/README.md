# @agent-workbench/history

Git history operations for AI agents. Understand code evolution through blame, history, and commit search.

## Why This Package?

AI agents often need to understand not just *what* code does, but *why* it exists:
- **Why was this written this way?** → `blame_file` shows commit messages per line
- **What changed recently?** → `recent_changes` shows what's been modified
- **When was this added?** → `file_history` shows commits touching a file
- **Find related changes** → `search_commits` finds commits by message
- **What symbols changed?** → `changed_symbols` shows semantic diff (functions/classes added/modified/deleted)

## Tools

### Read Operations
| Tool | Description |
|------|-------------|
| `blame_file` | Get git blame - who wrote each line and when |
| `file_history` | Get commits that touched a file |
| `recent_changes` | Get recently changed files |
| `commit_info` | Get details of a commit |
| `search_commits` | Search commits by message |
| `diff_file` | Get diff between commits |
| `branch_diff` | Compare branches - files changed, stats |
| `changed_symbols` | Get symbols (functions/classes) that changed between refs |

### Write Operations
| Tool | Description |
|------|-------------|
| `git_status` | Get current branch, staged/unstaged changes |
| `git_add` | Stage files for commit |
| `git_commit` | Create a commit with staged changes |

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

### Comparing Branches (PR Scope)
```
branch_diff { "base": "main", "head": "HEAD" }
```
Shows all files changed on the current branch vs main.

### Understanding Semantic Changes
```
changed_symbols { "from_ref": "main", "to_ref": "HEAD" }
```
Shows what functions, classes, and methods were added, modified, or deleted - useful for code review.

### Creating a Commit
```
git_status { }
git_add { "paths": ["src/feature.ts", "src/test.ts"] }
git_commit { "message": "feat: add new feature" }
```
Stage specific files and create a commit.

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

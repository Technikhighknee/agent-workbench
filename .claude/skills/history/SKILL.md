# History Skill

Git history operations for understanding code evolution.

## When to Use

Use this skill when you need to:
- Understand why code was written a certain way (`blame_file`)
- See what changed recently (`recent_changes`)
- Track how a file evolved (`file_history`)
- Find when a feature or fix was added (`search_commits`)
- Compare versions of code (`diff_file`)

## Tools

| Tool | Purpose |
|------|---------|
| `blame_file` | Get git blame - who wrote each line and their commit message |
| `file_history` | Get commits that touched a file |
| `recent_changes` | Get recently changed files across the repo |
| `commit_info` | Get details of a specific commit |
| `search_commits` | Search commits by message content |
| `diff_file` | Get diff of a file between two commits |

## Examples

### Understanding Why Code Exists
```
blame_file { "file_path": "src/auth.ts" }
```

### Finding What Broke
```
recent_changes { "count": 5 }
```

### Tracing File History
```
file_history { "file_path": "src/api.ts", "limit": 10 }
```

### Finding Related Commits
```
search_commits { "query": "authentication", "limit": 10 }
```

## allowed-tools

- mcp__history__blame_file
- mcp__history__file_history
- mcp__history__recent_changes
- mcp__history__commit_info
- mcp__history__search_commits
- mcp__history__diff_file

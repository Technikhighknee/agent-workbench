---
name: history
description: Understand WHY code exists. Git blame, history, and commit search - the context that makes changes safer.
allowed-tools: mcp__history__blame_file, mcp__history__file_history, mcp__history__recent_changes, mcp__history__commit_info, mcp__history__search_commits, mcp__history__diff_file
---

# history

**Stop guessing why code was written.** The commit message probably explains it.

## Tools

| Tool | Purpose |
|------|---------|
| `blame_file` | Who wrote each line + why |
| `file_history` | All commits that touched a file |
| `recent_changes` | What changed in last N commits |
| `commit_info` | Full details of a commit |
| `search_commits` | Find commits by message |
| `diff_file` | Compare versions |

## Quick Examples

```
blame_file({ file_path: 'src/auth.ts' })
recent_changes({ count: 5 })
search_commits({ query: 'authentication' })
diff_file({ file_path: 'src/auth.ts', from_ref: 'HEAD~5' })
```

**30 seconds reading blame saves hours of debugging.**

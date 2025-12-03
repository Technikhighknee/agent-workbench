---
name: history
tagline: "Understand WHY code exists. Git blame, history, and commits."
---

# history

**Stop guessing why code was written.** The commit message probably explains it.

## Start Here

```
blame_file({ file_path: 'src/auth.ts' })
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Who wrote this? | `git blame` in Bash | `blame_file` with structured output |
| What changed recently? | Parse `git log` output | `recent_changes` returns structured data |
| Find when bug introduced | Manual bisect | `search_commits` + `file_history` |

## Quick Reference

| Task | Tool |
|------|------|
| Who wrote each line | `blame_file` |
| Commits for a file | `file_history` |
| Recent changes | `recent_changes` |
| Commit details | `commit_info` |
| Find commits by message | `search_commits` |
| Diff between commits | `diff_file` |
| Branch comparison | `branch_diff` |
| What functions changed | `changed_symbols` |
| Current status | `git_status` |
| Stage files | `git_add` |
| Create commit | `git_commit` |

## Workflows

### Understand Why Code Exists
```
blame_file({ file_path: 'src/auth.ts' })
commit_info({ ref: 'abc123' })  // Get full commit message
```

### What Changed Recently?
```
recent_changes({ count: 5 })
changed_symbols({ from_ref: 'HEAD~5' })  // Semantic diff
```

### Create a Commit
```
git_status({})
git_add({ paths: ['src/auth.ts'] })
git_commit({ message: 'fix: handle expired tokens' })
```

## After Using

30 seconds reading blame saves hours of debugging.

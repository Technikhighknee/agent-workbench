---
name: history
description: "MANDATORY: Use INSTEAD of Bash git commands. Structured git blame, history, diff. NEVER use Bash for git operations."
allowed-tools: mcp__history__blame_file, mcp__history__file_history, mcp__history__recent_changes, mcp__history__commit_info, mcp__history__search_commits, mcp__history__diff_file, mcp__history__branch_diff
---

# history

**Structured git operations.** No parsing output. Direct data access.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| See who wrote code | `git blame file.ts` | `blame_file({ file_path })` |
| See file history | `git log -- file.ts` | `file_history({ file_path })` |
| See recent changes | `git log --oneline` | `recent_changes({ count })` |
| See commit details | `git show abc123` | `commit_info({ ref })` |
| Search commit messages | `git log --grep` | `search_commits({ query })` |
| See file diff | `git diff HEAD~1 file.ts` | `diff_file({ file_path, from_ref, to_ref })` |
| Compare branches | `git diff main..feature` | `branch_diff({ base, head })` |

## WHY MANDATORY

1. **Structured data** - Get objects, not text to parse
2. **No output parsing errors** - Direct field access
3. **Consistent format** - Same shape every time
4. **Better error handling** - Clear error messages

## NEGATIVE RULES

- **NEVER** `Bash: git log` - use `file_history` or `recent_changes`
- **NEVER** `Bash: git blame` - use `blame_file`
- **NEVER** `Bash: git diff` - use `diff_file` or `branch_diff`
- **NEVER** `Bash: git show` - use `commit_info`
- **NEVER** parse git output with grep/awk - use structured tools

## TOOL REFERENCE

| Tool | Purpose | Returns |
|------|---------|---------|
| `blame_file` | Who wrote each line? | Lines with author, commit, date |
| `file_history` | How did file evolve? | Commits that touched file |
| `recent_changes` | What changed lately? | Recent commits with files |
| `commit_info` | What's in this commit? | Full commit details |
| `search_commits` | Find by message | Matching commits |
| `diff_file` | What changed in file? | Unified diff |
| `branch_diff` | Branch comparison | Files changed, stats |

## COMMON WORKFLOWS

### Understand Code Origin
```
blame_file({ file_path: 'src/auth.ts' })
// See who wrote each line and when
```

### Track Bug Introduction
```
file_history({ file_path: 'src/broken.ts', limit: 10 })
// Find recent changes
commit_info({ ref: 'abc123' })
// See full details of suspicious commit
```

### Review Changes for PR
```
branch_diff({ base: 'main', head: 'HEAD' })
// See all changes on branch
diff_file({ file_path: 'src/changed.ts', from_ref: 'main' })
// See specific file changes
```

### Find Related Changes
```
search_commits({ query: 'authentication' })
// Find commits about auth
recent_changes({ count: 20 })
// See what happened recently
```

**Works with any git repository.** Auto-detects git root.

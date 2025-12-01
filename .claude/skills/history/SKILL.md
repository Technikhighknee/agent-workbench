---
name: history
description: "MANDATORY: Use INSTEAD of Bash git commands. Structured git blame, history, diff. NEVER use Bash for git operations."
allowed-tools: mcp__history__blame_file, mcp__history__file_history, mcp__history__recent_changes, mcp__history__commit_info, mcp__history__search_commits, mcp__history__diff_file, mcp__history__branch_diff
---

# history

**Stop guessing why code was written.** The commit message probably explains it.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| See who wrote code + why | `Bash: git blame` | `blame_file({ file_path })` |
| See commits that changed a file | `Bash: git log -- file` | `file_history({ file_path })` |
| See recent repository activity | `Bash: git log` | `recent_changes({ count: N })` |
| Get commit details | `Bash: git show` | `commit_info({ ref: 'abc123' })` |
| Find commits by message | `Bash: git log --grep` | `search_commits({ query: 'fix auth' })` |
| Compare file versions | `Bash: git diff` | `diff_file({ file_path, from_ref, to_ref })` |
| Get PR scope vs main | `Bash: git diff main...HEAD` | `branch_diff({ base: 'main' })` |

## WHY MANDATORY

- `blame_file` returns **STRUCTURED data** - author, date, message per line
- `file_history` includes **file stats** (additions/deletions) per commit
- `branch_diff` gives **ahead/behind counts** + file change summary
- Bash git commands return **raw text** requiring manual parsing

## NEGATIVE RULES

- **NEVER** use `Bash: git blame` - use `blame_file`
- **NEVER** use `Bash: git log` - use `file_history` or `recent_changes`
- **NEVER** use `Bash: git diff` - use `diff_file` or `branch_diff`
- **NEVER** parse git output manually - all history tools return structured JSON

## WHEN TO USE HISTORY

Use history tools **BEFORE** modifying code that:
- Looks unusual or has magic numbers
- Has comments like "DO NOT CHANGE" or "WORKAROUND"
- Was recently modified (check who/why)
- You don't understand the purpose of

## Tools

| Tool | Purpose |
|------|---------|
| `blame_file` | Who wrote each line + why |
| `file_history` | All commits that touched a file |
| `recent_changes` | What changed in last N commits |
| `commit_info` | Full details of a commit |
| `search_commits` | Find commits by message |
| `diff_file` | Compare versions |
| `branch_diff` | PR summary vs base branch |

## Quick Examples

```
blame_file({ file_path: 'src/auth.ts' })
recent_changes({ count: 5 })
search_commits({ query: 'authentication' })
diff_file({ file_path: 'src/auth.ts', from_ref: 'HEAD~5' })
branch_diff({ base: 'main' })
```

**30 seconds reading blame saves hours of debugging.**

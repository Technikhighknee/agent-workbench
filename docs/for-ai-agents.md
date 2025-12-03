# For AI Agents

[← Back to docs](README.md)

## Start Here

Call `mcp__project__get_session_guide` at the start of every session. It explains when to use each tool.

## Tool Selection

Use these MCP tools **instead of Bash** for better results:

| Task | Use This | Not This |
|------|----------|----------|
| Understand code | `mcp__insight__insight` | Reading multiple files manually |
| Edit functions | `mcp__syntax__edit_symbol` | Text-based Edit tool |
| Check types | `mcp__types__check_file` | `tsc --noEmit` |
| Run tests | `mcp__test-runner__run_tests` | `npm test` in Bash |
| Git operations | `mcp__history__*` | `git` in Bash |
| Long builds | `mcp__task-runner__task_run` | Bash (times out) |
| Preview changes | `mcp__preview__preview_edit` | Make change, check, undo |
| Track work | `mcp__board__*` | Mental notes |

## Common Workflows

### Understanding New Code

```
1. mcp__insight__insight({ target: "src/server.ts" })
   → Get structure, dependencies, recent changes in one call

2. mcp__syntax__list_symbols({ file_path: "..." })
   → See what functions/classes exist

3. mcp__history__blame_file({ file_path: "..." })
   → Understand why code exists
```

### Making Changes Safely

```
1. mcp__preview__preview_edit({ file, symbol, new_content })
   → See type errors and affected callers BEFORE editing

2. mcp__syntax__edit_symbol({ file_path, name_path, new_body })
   → Edit by symbol name, not text matching

3. mcp__types__check_file({ file })
   → Verify no type errors after edit

4. mcp__test-runner__run_related_tests({ source_file })
   → Run tests for the file you changed
```

### Running Builds

```
# Short commands (< 30s)
mcp__task-runner__task_run({ command: "npm run build" })

# Dev servers (background)
mcp__task-runner__task_start({
  command: "npm run dev",
  wait_for: "ready|listening"
})
```

## Package Quick Reference

| Package | Primary Tools |
|---------|--------------|
| [syntax](packages/syntax.md) | `list_symbols`, `read_symbol`, `edit_symbol`, `find_references` |
| [history](packages/history.md) | `blame_file`, `file_history`, `git_commit` |
| [types](packages/types.md) | `check_file`, `get_type`, `go_to_definition` |
| [test-runner](packages/test-runner.md) | `run_tests`, `run_related_tests`, `get_test_failures` |
| [task-runner](packages/task-runner.md) | `task_run`, `task_start`, `task_list` |
| [insight](packages/insight.md) | `insight`, `suggest_refactoring` |
| [preview](packages/preview.md) | `preview_edit` |
| [board](packages/board.md) | `board_list`, `board_add`, `board_move` |
| [project](packages/project.md) | `get_session_guide`, `get_quickstart` |

## Skill Files

Each package has a skill file in `.claude/skills/<package>/SKILL.md` with detailed usage patterns. These are loaded automatically when tools are invoked.

# agent-workbench
> Inspired by IDE

**At its current state: A collection of MCP servers that form an extensive operating toolbelt for AI-Agents like Claude Code**

This monorepo provides the agent with:

- Long-running processes they don't lose
- Symbol-aware code editing
- Real project orientation
- Git history with intent
- TypeScript verification
- Test execution
- Call graph analysis

Each package solves one foundational pain point.
Together, they form a minimal "development environment" for autonomous or semi-autonomous AI coding.

## Packages

1. [syntax](#agent-workbenchsyntax) - Symbol-aware code operations `25 tools`
2. [history](#agent-workbenchhistory) - Git operations and commits `11 tools`
3. [project](#agent-workbenchproject) - Project orientation and metadata `6 tools`
4. [types](#agent-workbenchtypes) - Fast TypeScript checking `4 tools`
5. [task-runner](#agent-workbenchtask-runner) - Persistent task execution `5 tools`
6. [test-runner](#agent-workbenchtest-runner) - Structured test results `6 tools`
7. [insight](#agent-workbenchinsight) - Comprehensive code understanding `2 tools`
8. [preview](#agent-workbenchpreview) - Edit impact prediction `1 tool`
9. [board](#agent-workbenchboard) - Task tracking board `6 tools`
10. [core](#agent-workbenchcore) - Shared utilities *(library, not MCP server)*

---

### [@agent-workbench/syntax](packages/syntax/)
Symbol-aware code operations for AI agents. Read and edit code by function/class name, not line numbers.

**File operations:**
- `list_symbols` - Get file structure
- `read_symbol` / `edit_symbol` - Read/write by symbol name
- `edit_lines` - Replace lines by number (for non-symbol edits)
- `get_imports` / `get_exports` - Analyze module boundaries

**Import management:**
- `add_import` - Add/merge import statements
- `remove_unused_imports` - Clean up unused imports
- `organize_imports` - Sort and group imports

**Cross-file analysis:**
- `search_symbols` / `find_references` - Cross-file search
- `get_callers` / `get_callees` - Call hierarchy
- `analyze_deps` - Circular dependency detection
- `find_unused_exports` - Find dead code (unused exports)
- `trace` - Follow call chains forward/backward
- `find_paths` - All paths between two symbols
- `find_dead_code` - Find functions unreachable from exports

**Refactoring:**
- `rename_symbol` - Safe cross-file renaming
- `move_file` - Move file and update all imports
- `move_symbol` - Move function/class to another file
- `extract_function` - Extract code block into new function
- `inline_function` - Replace function call with function body

**Multi-file operations:**
- `apply_edits` - Apply multiple edits atomically with rollback on failure
- `batch_edit_symbols` - Edit multiple symbols across files atomically

---

### [@agent-workbench/history](packages/history/)
Git operations for AI agents. Understand code evolution and create commits.

**Read operations:**
- `blame_file` - Who wrote each line and why
- `file_history` - Commits that touched a file
- `recent_changes` - What changed recently
- `commit_info` / `search_commits` - Commit details and search
- `diff_file` - Compare file between commits
- `branch_diff` - Summary of changes vs base branch (PR scope)
- `changed_symbols` - What functions/classes changed between refs (semantic diff)

**Write operations:**
- `git_status` - Current branch, staged/unstaged changes
- `git_add` - Stage files for commit
- `git_commit` - Create a commit with staged changes

---

### [@agent-workbench/project](packages/project/)
Project metadata and orientation. Quickly understand project structure and available commands.

- `get_session_guide` - **Start here** - MCP tool usage guidance
- `get_quickstart` - How to install, build, test, and run
- `get_tech_stack` - Detect frameworks and libraries
- `get_structure` - Directory layout with descriptions
- `get_project_info` - Project name, type, version, scripts overview
- `get_scripts` - Available commands to run

---

### [@agent-workbench/types](packages/types/)
Fast single-file type checking. Never hangs - all operations complete in <5 seconds.

- `check_file` - Check a single file for type errors (fast, <2s)
- `get_type` - Hover info and type details at a position
- `go_to_definition` - Navigate to where symbols are defined
- `get_quick_fixes` - Available fixes for errors at a position

For project-wide checks, use `tsc --noEmit` via task-runner instead.

---

### [@agent-workbench/task-runner](packages/task-runner/)
Task execution with SQLite persistence. Tasks survive server restarts.

- `task_run` - Run command, wait for completion (default 30s timeout)
- `task_start` - Start background task, optionally wait for pattern
- `task_get` - Get task status and output
- `task_kill` - Stop a running task
- `task_list` - See all tasks (including from previous sessions)

---

### [@agent-workbench/test-runner](packages/test-runner/)
Run tests and get structured results. Framework-agnostic with source-mapped failures.

- `run_tests` - Execute tests with structured pass/fail results
- `get_test_failures` - Detailed failure info with source locations
- `list_test_files` - Discover test files by pattern
- `rerun_failed` - Re-execute only failing tests
- `find_tests_for` - Find tests related to a source file (naming, imports, co-location)
- `run_related_tests` - Run tests for a specific source file

---

### [@agent-workbench/insight](packages/insight/)
Comprehensive code understanding in one call. Structure, relationships, and history together.

- `insight` - Understand a file, directory, or symbol
  - **File**: Language, metrics, symbols, imports/exports, who imports it, git history
  - **Directory**: Entry points, all files (recursive), key symbols, dependencies, git history
  - **Symbol**: Code, signature, callers/callees, related symbols, git history
- `suggest_refactoring` - Analyze code and suggest improvements
  - Detects: long functions, large files, high coupling, unused code
  - Returns prioritized suggestions with actionable advice

Replaces multiple tool calls (list_symbols + get_imports + get_exports + file_history + find_references) with a single comprehensive view.

---

### [@agent-workbench/preview](packages/preview/)
Impact preview before making changes. See consequences without applying edits.

- `preview_edit` - Preview what happens if you make a change
  - **Type errors**: Predicted errors from the change
  - **Affected callers**: Code that calls the modified symbol
  - **Related tests**: Tests to run after the change
  - **Impact summary**: Risk assessment and suggestions

---

### [@agent-workbench/board](packages/board/)
Task board for AI agents. Track work items with a persistent kanban board.

- `board_list` - List cards with optional filtering by list, labels, priority
- `board_add` - Create a new card with title, description, priority, labels
- `board_update` - Update card properties
- `board_move` - Move card between lists (backlog → todo → in_progress → done)
- `board_get` - Get full card details
- `board_delete` - Remove a card

Board state persists across sessions in SQLite.

---

### [@agent-workbench/core](packages/core/)
Shared utilities for all packages. **Not an MCP server.**

- `Result<T, E>` type for explicit error handling
- MCP response helpers (`textResponse`, `errorResponse`, `resultToResponse`)
- Server bootstrap utilities (`runServer`)

---

## For AI Agents

**Start with** `mcp__project__get_session_guide` to learn when to use each tool.

Key principle: **Use these MCP tools instead of Bash** for:
- Understanding code → `mcp__insight__insight` (comprehensive, one call)
- Code quality analysis → `mcp__insight__suggest_refactoring`
- Preview changes → `mcp__preview__preview_edit` (see consequences before editing)
- Git operations → `mcp__history__*`
- TypeScript checking → `mcp__types__*`
- Running tests → `mcp__test_runner__*` (including `find_tests_for`, `run_related_tests`)
- Long builds → `mcp__task_runner__*`
- Code read/edit → `mcp__syntax__*` (including `batch_edit_symbols` for atomic multi-file edits)
- Project info → `mcp__project__*`
- Track work → `mcp__board__*`

Each package has a skill file in `.claude/skills/` with detailed usage patterns.

## Quick Start

```bash
npm install
npm run build
```

Each package runs as an MCP server. Configure in Claude Code's `mcp_servers` setting.

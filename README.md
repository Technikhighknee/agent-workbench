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
- Semantic graph navigation

Each package solves one foundational pain point.
Together, they form a minimal "development environment" for autonomous or semi-autonomous AI coding.

## Packages (./packages)

### [@agent-workbench/syntax](packages/syntax/)
Symbol-aware code operations for AI agents. Read and edit code by function/class name, not line numbers.

- `list_symbols` - Get file structure
- `read_symbol` / `edit_symbol` - Read/write by symbol name
- `edit_lines` - Replace lines by number (for non-symbol edits)
- `get_imports` / `get_exports` - Analyze module boundaries
- `search_symbols` / `find_references` - Cross-file search
- `get_callers` / `get_callees` - Call hierarchy
- `analyze_deps` - Circular dependency detection
- `rename_symbol` - Safe cross-file renaming

### [@agent-workbench/process-host](packages/process-host/)
Process management with persistent tracking, log capture, and lifecycle control.

- `run_process` - Run command, wait for completion
- `spawn_process` - Start background process
- `get_logs` / `search_logs` - Monitor output
- `get_process` / `list_processes` - Query process state
- `stop_process` / `restart_process` - Lifecycle control
- `stop_all_processes` - Stop everything at once
- `wait_for_pattern` - Block until output matches
- `write_stdin` - Send input to running process
- `send_signal` - Send signals (SIGHUP, SIGINT, etc.)
- `purge_processes` / `get_stats` - Cleanup and statistics

### [@agent-workbench/history](packages/history/)
Git operations for AI agents. Understand code evolution and create commits.

**Read operations:**
- `blame_file` - Who wrote each line and why
- `file_history` - Commits that touched a file
- `recent_changes` - What changed recently
- `commit_info` / `search_commits` - Commit details and search
- `diff_file` - Compare file between commits
- `branch_diff` - Summary of changes vs base branch (PR scope)

**Write operations:**
- `git_status` - Current branch, staged/unstaged changes
- `git_add` - Stage files for commit
- `git_commit` - Create a commit with staged changes

### [@agent-workbench/project](packages/project/)
Project metadata and orientation. Quickly understand project structure, configs, and available commands.

- `get_session_guide` - **Start here** - MCP tool usage guidance
- `get_quickstart` - How to install, build, test, and run
- `get_tech_stack` - Detect frameworks and libraries
- `get_structure` - Directory layout with descriptions
- `get_project_info` - Project name, type, version, scripts overview
- `get_scripts` - Available commands to run
- `get_dependencies` - Production and dev dependencies
- `find_configs` / `read_config` - Configuration file discovery

### [@agent-workbench/graph](packages/graph/)
Semantic code graph for deep code understanding. Trace call chains, find paths, understand relationships.
**Auto-initializes on first query** using current working directory.

- `graph_get_symbol` - Get symbol with source code
- `graph_get_callers` / `graph_get_callees` - Call relationships
- `graph_trace` - Follow call chains forward/backward
- `graph_find_paths` - All paths between two symbols
- `graph_find_symbols` - Search by pattern or tags
- `graph_query` - Compound queries with traversal
- `graph_initialize` - Manually re-index if needed

### [@agent-workbench/types](packages/types/)
TypeScript language service integration. Get type errors, hover info, and go-to-definition.
**Auto-syncs** via file watcher (no manual notify needed).

- `get_diagnostics` - Type errors and warnings for file or project
- `get_type_at_position` - Hover info and type details
- `go_to_definition` - Navigate to where symbols are defined
- `find_type_references` - Type-aware reference finding
- `get_quick_fixes` - Available fixes for errors
- `notify_file_changed` - Manual sync if needed
- `reload` - Re-discover tsconfig.json files (monorepo support)

### [@agent-workbench/test-runner](packages/test-runner/)
Run tests and get structured results. Framework-agnostic with source-mapped failures.

- `run_tests` - Execute tests with structured pass/fail results
- `get_test_failures` - Detailed failure info with source locations
- `list_test_files` - Discover test files by pattern
- `rerun_failed` - Re-execute only failing tests

## For AI Agents

**Start with** `mcp__project__get_session_guide` to learn when to use each tool.

Key principle: **Use these MCP tools instead of Bash** for:
- Git operations → `mcp__history__*`
- TypeScript checking → `mcp__types__*`
- Running tests → `mcp__test-runner__*`
- Long builds → `mcp__process-host__*`
- Code read/edit → `mcp__syntax__*`
- Project info → `mcp__project__*`
- Call graph analysis → `mcp__graph__*`

Each package has a skill file in `.claude/skills/` with detailed usage patterns.

## Quick Start

```bash
npm install
npm run build
```

Each package runs as an MCP server. Configure in Claude Code's `mcp_servers` setting.

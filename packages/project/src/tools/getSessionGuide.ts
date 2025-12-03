/**
 * get_session_guide tool - Comprehensive guidance for using agent-workbench MCP tools.
 * Designed to be called at the start of a session.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const SESSION_GUIDE = `# Agent Workbench - MCP Tools Usage Guide

**You have specialized MCP tools available.** Use them instead of Bash for better results.

These tools give you: structured data, no timeouts, source-mapped errors, semantic code operations.

## First: Understand Code With One Call

Before diving into unfamiliar code, use **insight** to understand it in one call:
\`\`\`
mcp__insight__insight({ target: "src/server.ts" })     // understand a file
mcp__insight__insight({ target: "src/utils" })         // understand a directory
mcp__insight__insight({ target: "TaskRunner" })        // understand a class/function
\`\`\`

Returns: symbols, imports/exports, callers/callees, git history, metrics, and notes - all at once.

## Critical Rules: NEVER Use Bash For These

### Git Operations
❌ NEVER: \`git log\`, \`git blame\`, \`git diff\`, \`git status\`, \`git add\`, \`git commit\`
✅ ALWAYS: \`mcp__history__*\` tools
- \`blame_file\` - who wrote each line
- \`file_history\` - commits that touched a file
- \`recent_changes\` - recently changed files
- \`commit_info\` - details of a commit
- \`search_commits\` - search commit messages
- \`branch_diff\` - compare branches
- \`diff_file\` - diff between commits
- \`changed_symbols\` - what functions/classes changed between refs
- \`git_status\` - current branch, staged/unstaged changes
- \`git_add\` - stage files for commit
- \`git_commit\` - create a commit with staged changes

### TypeScript Checking
❌ NEVER: \`tsc\`, \`tsc --noEmit\`
✅ ALWAYS: \`mcp__types__*\` tools
- \`get_diagnostics\` - type errors for file/project
- \`get_type_at_position\` - hover info
- \`go_to_definition\` - find where symbol is defined
- \`find_type_references\` - all usages of a symbol
- \`get_quick_fixes\` - auto-fix suggestions

### Running Tests
❌ NEVER: \`npm test\`, \`vitest\`, \`jest\`
✅ ALWAYS: \`mcp__test-runner__*\` tools
- \`run_tests\` - structured results, source-mapped failures
- \`list_test_files\` - discover test files
- \`get_test_failures\` - detailed failure info
- \`rerun_failed\` - retry only failures

### Build & Long-Running Processes
❌ NEVER: Bash for builds (timeout issues)
✅ ALWAYS: \`mcp__task-runner__*\` tools
- \`task_run\` - waits 30s, then returns control if still running
- \`task_start\` - background tasks, optionally wait for pattern
- \`task_get\` - check task status and output
- \`task_kill\` - terminate a task
- \`task_list\` - see all tasks (persists across server restarts)

### Reading/Editing Code
❌ NEVER: Read + Edit for functions/classes
✅ ALWAYS: \`mcp__syntax__*\` tools
- \`list_symbols\` - see file structure
- \`read_symbol\` - read function by name (not line numbers)
- \`edit_symbol\` - edit function by name (not string matching)
- \`edit_lines\` - edit by line number when symbol edit won't work
- \`search_symbols\` - find across codebase
- \`find_references\` - all usages
- \`get_imports\` / \`get_exports\` - module boundaries
- \`add_import\` - add/merge import statements
- \`remove_unused_imports\` - clean up unused imports
- \`organize_imports\` - sort and group imports
- \`get_callers\` / \`get_callees\` - call hierarchy
- \`analyze_deps\` - circular dependency detection
- \`rename_symbol\` - rename across codebase
- \`move_file\` - move file and update all imports
- \`move_symbol\` - move function/class to another file
- \`extract_function\` - extract code block into new function
- \`inline_function\` - replace function call with function body
- \`find_unused_exports\` - find dead code (unused exports)

### Project Orientation
When starting in a new codebase:
✅ USE: \`mcp__project__*\` tools
- \`get_session_guide\` - this guide
- \`get_project_info\` - name, version, scripts
- \`get_scripts\` - available npm scripts
- \`get_quickstart\` - install, build, test, run commands
- \`get_tech_stack\` - detect frameworks & libraries
- \`get_structure\` - directory layout with descriptions

### Understanding Code (Comprehensive)
For quick orientation and understanding:
✅ USE: \`mcp__insight__insight\`
- One call to understand a file, directory, or symbol
- Returns: symbols, imports, exports, relationships, git history, metrics

For call graph analysis:
✅ USE: \`mcp__syntax__*\` tools
- \`get_callers\` / \`get_callees\` - call relationships
- \`trace\` - call chains forward/backward
- \`find_paths\` - how does A reach B?
- \`find_dead_code\` - find unreachable functions

## Quick Decision Guide

| I want to... | Use |
|-------------|-----|
| **Understanding code** | |
| Understand a file/class/module | \`mcp__insight__insight\` |
| **Refactoring** | |
| What breaks if I change X? | \`mcp__syntax__get_callers\` |
| Move file safely | \`mcp__syntax__move_file\` |
| Move function to another file | \`mcp__syntax__move_symbol\` |
| Extract code to function | \`mcp__syntax__extract_function\` |
| Inline a function | \`mcp__syntax__inline_function\` |
| Find unused exports | \`mcp__syntax__find_unused_exports\` |
| Find unreachable code | \`mcp__syntax__find_dead_code\` |
| Clean up imports | \`mcp__syntax__remove_unused_imports\` |
| Organize imports | \`mcp__syntax__organize_imports\` |
| **Code operations** | |
| Read a function | \`mcp__syntax__read_symbol\` |
| Edit a function | \`mcp__syntax__edit_symbol\` |
| Find symbol | \`mcp__syntax__search_symbols\` |
| **Type checking** | |
| Check for errors | \`mcp__types__get_diagnostics\` |
| Type at position | \`mcp__types__get_type_at_position\` |
| **Testing** | |
| Run tests | \`mcp__test-runner__run_tests\` |
| See failures | \`mcp__test-runner__get_test_failures\` |
| **Git** | |
| See git history | \`mcp__history__file_history\` |
| Who wrote this | \`mcp__history__blame_file\` |
| What symbols changed | \`mcp__history__changed_symbols\` |
| Current status | \`mcp__history__git_status\` |
| **Builds/Servers** | |
| Build project | \`mcp__task-runner__task_run\` |
| Start dev server | \`mcp__task-runner__task_start\` |
| **Deep analysis** | |
| Who calls X | \`mcp__syntax__get_callers\` |
| Trace call chains | \`mcp__syntax__trace\` |
| Path A→B | \`mcp__syntax__find_paths\` |
`;

export function registerGetSessionGuide(server: McpServer): void {
  server.registerTool(
    "get_session_guide",
    {
      title: "Get session guide",
      description:
        "MANDATORY: Call this at the start of every session and after context compacting. " +
        "Learn about 60+ specialized MCP tools that replace Bash for git, TypeScript, tests, " +
        "builds, and code editing. These tools give structured results, no timeouts, and " +
        "semantic operations. Covers: insight, history, types, test-runner, task-runner, syntax packages.",
      inputSchema: {},
    },
    async () => {
      return { content: [{ type: "text", text: SESSION_GUIDE }] };
    }
  );
}

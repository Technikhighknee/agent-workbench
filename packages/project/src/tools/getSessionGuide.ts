/**
 * get_session_guide tool - Comprehensive guidance for using agent-workbench MCP tools.
 * Designed to be called at the start of a session.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const SESSION_GUIDE = `# Agent Workbench - MCP Tools Usage Guide

Call this at session start to understand which tools to use.

## Critical Rules: NEVER Use Bash For These

### Git Operations
❌ NEVER: \`git log\`, \`git blame\`, \`git diff\`, \`git status\`
✅ ALWAYS: \`mcp__history__*\` tools
- \`blame_file\` - who wrote each line
- \`file_history\` - commits that touched a file
- \`commit_info\` - details of a commit
- \`branch_diff\` - compare branches
- \`diff_file\` - diff between commits

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
- \`get_test_failures\` - detailed failure info
- \`rerun_failed\` - retry only failures

### Build & Long-Running Processes
❌ NEVER: Bash for builds (timeout issues)
✅ ALWAYS: \`mcp__process-host__*\` tools
- \`run_process\` - blocking with clean output
- \`spawn_process\` - background processes
- \`get_logs\` - check output
- \`wait_for_pattern\` - wait for "ready" messages

### Reading/Editing Code
❌ NEVER: Read + Edit for functions/classes
✅ ALWAYS: \`mcp__syntax__*\` tools
- \`list_symbols\` - see file structure
- \`read_symbol\` - read function by name (not line numbers)
- \`edit_symbol\` - edit function by name (not string matching)
- \`search_symbols\` - find across codebase
- \`find_references\` - all usages
- \`get_callers\` / \`get_callees\` - call relationships

### Project Information
❌ NEVER: Read package.json directly
✅ ALWAYS: \`mcp__project__*\` tools
- \`get_project_info\` - name, version, scripts
- \`get_dependencies\` - deps with versions
- \`get_scripts\` - available npm scripts
- \`find_configs\` - find config files

### New Codebase Orientation
When starting in a new codebase:
✅ USE: \`mcp__project__*\` orientation tools
- \`get_quickstart\` - install, build, test, run commands
- \`get_tech_stack\` - detect frameworks & libraries
- \`get_structure\` - directory layout with descriptions

### Code Understanding (Semantic)
For deep code understanding:
✅ USE: \`mcp__graph__*\` tools
- \`graph_initialize\` - index the codebase
- \`graph_query\` - traverse relationships
- \`graph_trace\` - call chains forward/backward
- \`graph_find_paths\` - how does A reach B?

## Quick Decision Guide

| I want to... | Use |
|-------------|-----|
| **New codebase?** | |
| How to build/test | \`mcp__project__get_quickstart\` |
| What tech is used | \`mcp__project__get_tech_stack\` |
| Directory layout | \`mcp__project__get_structure\` |
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
| **Builds/Servers** | |
| Build project | \`mcp__process-host__run_process\` |
| Start dev server | \`mcp__process-host__spawn_process\` |
| **Deep analysis** | |
| Who calls X | \`mcp__graph__graph_get_callers\` |
| Trace call chains | \`mcp__graph__graph_trace\` |
| Path A→B | \`mcp__graph__graph_find_paths\` |
`;

export function registerGetSessionGuide(server: McpServer): void {
  server.registerTool(
    "get_session_guide",
    {
      title: "Get session guide",
      description:
        "Get comprehensive guidance on using agent-workbench MCP tools. " +
        "Call this at the START of a session to understand which tools to use " +
        "and what to AVOID (like using Bash for git, tsc, or tests).",
      inputSchema: {},
    },
    async () => {
      return { content: [{ type: "text", text: SESSION_GUIDE }] };
    }
  );
}

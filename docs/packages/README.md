# Packages

[← Back to docs](../README.md)

## MCP Servers

| Package | Tools | Description |
|---------|-------|-------------|
| [board](board.md) | 6 | A simple task board for AI agents - Trello-like MCP tools for managing work |
| [core](core.md) | 0 | Shared utilities for agent-workbench packages |
| [history](history.md) | 11 | MCP server for git history operations. Understand code evolution through blame, history, and commit search. |
| [insight](insight.md) | 2 | MCP server for comprehensive code understanding. One call to understand a file, module, or symbol. |
| [preview](preview.md) | 1 | Impact preview and consequence analysis for AI agents |
| [project](project.md) | 6 | MCP server for project metadata operations. Understand project structure, configs, and available commands. |
| [syntax](syntax.md) | 25 | MCP server for symbol-aware code operations. Read and edit code by function/class name, not line numbers. |
| [task-runner](task-runner.md) | 5 | Robust task execution for AI agents with detached processes and JSON persistence |
| [test-runner](test-runner.md) | 6 | MCP server for running tests with structured results. Framework-agnostic, maps failures to source locations. |
| [types](types.md) | 4 | MCP server for TypeScript language service integration. Get type errors, hover info, and go-to-definition. |

## Dependencies

```
core ──┬── syntax ────── insight
       ├── history
       ├── project
       ├── types ─────── preview
       ├── task-runner ─ test-runner
       └── board
```
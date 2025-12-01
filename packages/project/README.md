# @agent-workbench/project

Project metadata operations for AI agents. Quickly understand project structure, configs, and available commands.

## Why This Package?

When an AI agent starts working on a project, it needs to quickly understand:
- **What kind of project is this?** → `get_project_info` detects npm/cargo/python/go
- **What commands can I run?** → `get_scripts` lists available scripts
- **What are the dependencies?** → `get_dependencies` shows packages
- **Where are the configs?** → `find_configs` locates configuration files
- **Is this a monorepo?** → `get_project_info` shows workspace packages

## Tools

| Tool | Description |
|------|-------------|
| `get_project_info` | Get project name, type, version, scripts, dependencies |
| `get_scripts` | Get available scripts/commands |
| `get_dependencies` | Get dependencies (production/dev/all) |
| `find_configs` | Find configuration files (tsconfig, eslint, etc.) |
| `read_config` | Read a specific config file |

## Supported Project Types

- **npm** - Node.js projects with `package.json`
- **cargo** - Rust projects with `Cargo.toml`
- **python** - Python projects with `pyproject.toml` or `setup.py`
- **go** - Go projects with `go.mod`

## Installation

```bash
npm install @agent-workbench/project
```

## MCP Configuration

```json
{
  "mcpServers": {
    "project": {
      "command": "npx",
      "args": ["@agent-workbench/project"]
    }
  }
}
```

## Usage Examples

### Quick Project Overview
```
get_project_info {}
```
Returns project type, version, available scripts, and dependency counts.

### List Available Commands
```
get_scripts {}
```
Shows all runnable scripts with their actual commands.

### Check Dependencies
```
get_dependencies { "type": "production" }
```
Lists production dependencies with versions.

### Find Configuration
```
find_configs {}
```
Locates all config files (tsconfig.json, .eslintrc, etc.).

## Architecture

```
src/
├── core/
│   ├── model.ts          # Domain types
│   └── ProjectService.ts # Project detection and parsing
├── tools/                # MCP tool implementations
└── server.ts             # MCP server entry point
```

# @agent-workbench/project

Project metadata and orientation for AI agents. Quickly understand project structure and available commands.

## Why This Package?

When an AI agent starts working on a project, it needs to quickly understand:
- **What MCP tools do I have?** → `get_session_guide` explains all available tools
- **How do I build/test/run?** → `get_quickstart` gives actionable commands
- **What frameworks are used?** → `get_tech_stack` detects technologies
- **What's the directory layout?** → `get_structure` maps the codebase
- **What kind of project is this?** → `get_project_info` detects npm/cargo/python/go
- **What commands can I run?** → `get_scripts` lists available scripts

## Tools

| Tool | Description |
|------|-------------|
| `get_session_guide` | **Start here** - Learn all MCP tools and when to use them |
| `get_quickstart` | Get install, build, test, run commands |
| `get_tech_stack` | Detect frameworks, libraries, and build tools |
| `get_structure` | Get directory layout with descriptions |
| `get_project_info` | Get project name, type, version, scripts |
| `get_scripts` | Get available scripts/commands |

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

### First: Learn Available Tools
```
get_session_guide {}
```
Returns comprehensive guide on all MCP tools and when to use each one.

### New Codebase Orientation
```
get_quickstart {}
get_tech_stack {}
get_structure {}
```
Get install/build/test commands, detect technologies, and understand directory layout.

### Quick Project Overview
```
get_project_info {}
```
Returns project type, version, available scripts, and workspace info.

### List Available Commands
```
get_scripts {}
```
Shows all runnable scripts with their actual commands.

## Architecture

```
src/
├── core/
│   ├── model.ts          # Domain types
│   └── ProjectService.ts # Project detection and parsing
├── tools/                # MCP tool implementations
└── server.ts             # MCP server entry point
```

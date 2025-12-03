# project

[← Back to packages](README.md) · [Source](../../packages/project/)

MCP server for project metadata operations. Understand project structure, configs, and available commands.

## Tools

| Tool | Description |
|------|-------------|
| `get_project_info` | Get basic project information - name, type, version, available scripts. |
| `get_quickstart` | Get actionable commands to install, build, test, and run this project. |
| `get_scripts` | Get available scripts/commands that can be run in this project |
| `get_session_guide` | MANDATORY: Call this at the start of every session and after context compacting. |
| `get_structure` | Get an overview of the project |
| `get_tech_stack` | Detect frameworks, libraries, and tools used in this project. |

## MCP Configuration

```json
{
  "project": {
    "command": "npx",
    "args": ["@agent-workbench/project"]
  }
}
```

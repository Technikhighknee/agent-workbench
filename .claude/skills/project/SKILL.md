---
name: project
description: Instant project orientation. Type, commands, dependencies, configs - one call gets you started.
allowed-tools: mcp__project__get_project_info, mcp__project__get_scripts, mcp__project__get_dependencies, mcp__project__find_configs, mcp__project__read_config
---

# project

**Know any project in seconds.** Type, commands, dependencies, configs.

## Tools

| Tool | Purpose |
|------|---------|
| `get_project_info` | Full overview: type, version, scripts, workspaces |
| `get_scripts` | Available commands |
| `get_dependencies` | Packages (production/dev/all) |
| `find_configs` | tsconfig, eslint, etc. |
| `read_config` | Read any config file |

## Quick Examples

```
get_project_info({})
get_scripts({})
get_dependencies({ type: 'production' })
find_configs({})
```

**Works from any subdirectory** - auto-detects project root.
**Supports:** npm, cargo, python, go

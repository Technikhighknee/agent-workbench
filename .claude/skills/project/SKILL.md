# Project Skill

Project metadata operations for quick project orientation.

## When to Use

Use this skill when you need to:
- Understand what kind of project you're working with (`get_project_info`)
- Find available commands/scripts (`get_scripts`)
- Check dependencies (`get_dependencies`)
- Locate configuration files (`find_configs`)

## Tools

| Tool | Purpose |
|------|---------|
| `get_project_info` | Get project name, type, version, scripts overview |
| `get_scripts` | List available scripts/commands |
| `get_dependencies` | List dependencies (production/dev/all) |
| `find_configs` | Find configuration files (tsconfig, eslint, etc.) |
| `read_config` | Read a specific config file |

## Examples

### Quick Project Overview
```
get_project_info {}
```

### Find Runnable Commands
```
get_scripts {}
```

### Check Production Dependencies
```
get_dependencies { "type": "production" }
```

### Find All Configs
```
find_configs {}
```

## allowed-tools

- mcp__project__get_project_info
- mcp__project__get_scripts
- mcp__project__get_dependencies
- mcp__project__find_configs
- mcp__project__read_config

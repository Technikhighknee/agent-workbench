---
name: project
description: "MANDATORY: Use INSTEAD of Read package.json. Structured project info, scripts, deps. NEVER read package.json directly."
allowed-tools: mcp__project__get_project_info, mcp__project__get_scripts, mcp__project__get_dependencies, mcp__project__find_configs, mcp__project__read_config
---

# project

**Know any project in seconds.** Type, commands, dependencies, configs.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Understand project structure | `Read: package.json` | `get_project_info({})` |
| Find available commands | `Read: package.json` scripts | `get_scripts({})` |
| List dependencies | `Read: package.json` deps | `get_dependencies({ type })` |
| Find config files | `Glob: *config*` | `find_configs({})` |
| Read a config file | `Read: tsconfig.json` | `read_config({ path: 'tsconfig.json' })` |
| Check if monorepo | `Glob` + manual check | `get_project_info({})` → workspaces |

## WHY MANDATORY

- `get_project_info` returns **STRUCTURED data** - type, version, scripts, workspaces
- `get_dependencies` **CATEGORIZES** by production/development/peer/optional
- `find_configs` **IDENTIFIES config types** (typescript, eslint, jest, etc.)
- Reading package.json gives **RAW JSON** requiring manual extraction

## NEGATIVE RULES

- **NEVER** `Read: package.json` to understand project - use `get_project_info`
- **NEVER** `Read: package.json` for scripts - use `get_scripts`
- **NEVER** `Glob` for config files - use `find_configs`
- **NEVER** guess project type - `get_project_info` tells you (npm/cargo/python/go)

## WHEN TO USE PROJECT

Use project tools at **SESSION START**:
1. `get_project_info({})` - Understand what you're working with
2. `get_scripts({})` - Know available commands
3. `find_configs({})` - Know what tools are configured

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
read_config({ path: 'tsconfig.json' })
```

**Works from any subdirectory** - auto-detects project root.
**Supports:** npm, cargo, python, go

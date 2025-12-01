---
name: project
description: "MANDATORY: Use INSTEAD of Read package.json. Structured project info, scripts, deps. NEVER read package.json directly."
allowed-tools: mcp__project__get_session_guide, mcp__project__get_project_info, mcp__project__get_scripts, mcp__project__get_dependencies, mcp__project__find_configs, mcp__project__read_config, mcp__project__get_quickstart, mcp__project__get_tech_stack, mcp__project__get_structure
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
| Get install/build/test commands | Search scripts manually | `get_quickstart({})` |
| Know what frameworks are used | Read & analyze package.json | `get_tech_stack({})` |
| Understand directory layout | `ls` + manual exploration | `get_structure({})` |

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
1. `get_session_guide({})` - **FIRST** - Learn which MCP tools to use and when
2. `get_project_info({})` - Understand what you're working with
3. `get_scripts({})` - Know available commands
4. `find_configs({})` - Know what tools are configured
## Tools

| Tool | Purpose |
|------|---------|
| `get_session_guide` | **CALL FIRST** - Learn all MCP tools and when to use them |
| `get_project_info` | Full overview: type, version, scripts, workspaces |
| `get_scripts` | Available commands |
| `get_dependencies` | Packages (production/dev/all) |
| `find_configs` | tsconfig, eslint, etc. |
| `read_config` | Read any config file |
| `get_quickstart` | **NEW CODEBASE?** - install, build, test, run commands |
| `get_tech_stack` | **WHAT TECH?** - frameworks, libraries, build tools detected |
| `get_structure` | **EXPLORE** - directory layout with descriptions |

## Quick Examples

```
// Orientation in new codebase
get_quickstart({})      // How to install, build, test, run
get_tech_stack({})      // React? TypeScript? Vite?
get_structure({})       // What directories exist, where to start

// Detailed project info
get_project_info({})
get_scripts({})
get_dependencies({ type: 'production' })
find_configs({})
read_config({ path: 'tsconfig.json' })
```

## Recommended Flow for New Codebases

1. `get_session_guide({})` - Learn which MCP tools to use
2. `get_quickstart({})` - Know how to build/test
3. `get_tech_stack({})` - Understand the technology
4. `get_structure({})` - See directory layout

**Works from any subdirectory** - auto-detects project root.
**Supports:** npm, cargo, python, go

## Agent Feedback

Found issues or have suggestions? Write to `/feedback/`:
- `feedback/tools/` - Tool observations
- `feedback/skills/` - Skill file observations
- `feedback/patterns/` - Useful patterns discovered

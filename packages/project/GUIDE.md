---
name: project
tagline: "Know any codebase in 10 seconds."
---

# project

**Instant project orientation.** Scripts, tech stack, structure.

## Start Here

```
get_session_guide({})
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| What can I run? | Read package.json | `get_scripts` |
| What framework? | Guess from files | `get_tech_stack` |
| Project structure | Manual exploration | `get_structure` |

## Quick Reference

| Task | Tool |
|------|------|
| MCP tool guidance | `get_session_guide` |
| How to run/build/test | `get_quickstart` |
| Detect frameworks | `get_tech_stack` |
| Directory layout | `get_structure` |
| Project metadata | `get_project_info` |
| Available commands | `get_scripts` |

## Workflows

### New Codebase
```
get_session_guide({})  // First!
get_quickstart({})     // How to run things
get_structure({})      // What's where
```

### Find Commands
```
get_scripts({})
get_project_info({})
```

## Supports

npm, cargo, python, go

Works from any subdirectory - auto-detects project root.

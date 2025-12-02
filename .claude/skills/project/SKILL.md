---
name: project
description: "Know any codebase in 10 seconds. Scripts, tech stack, structure."
allowed-tools: mcp__project__get_session_guide, mcp__project__get_project_info, mcp__project__get_scripts, mcp__project__get_quickstart, mcp__project__get_tech_stack, mcp__project__get_structure
---

# project

**Instant orientation. Know what you're working with before touching code.**

## First: get_session_guide

At session start, ALWAYS:
```
get_session_guide({})
```
This teaches you all the MCP tools and when to use them.

## Why This Wins

| The Problem | Built-in Failure | project Solution |
|-------------|------------------|------------------|
| What is this project? | Read package.json manually | `get_project_info` structured data |
| How to build/test? | Search through scripts | `get_quickstart` gives commands |
| What tech? | Analyze dependencies | `get_tech_stack` detects frameworks |
| Where's the code? | ls and guess | `get_structure` maps directories |

## Quick Reference

| Task | Tool |
|------|------|
| Learn all tools | `get_session_guide` |
| Build/test commands | `get_quickstart` |
| Tech stack | `get_tech_stack` |
| Directory layout | `get_structure` |
| Project metadata | `get_project_info` |
| Available scripts | `get_scripts` |

## Recommended Flow

### New Codebase
```
get_session_guide({})  // Learn tools
get_quickstart({})     // How to build/test
get_tech_stack({})     // What frameworks
get_structure({})      // Where's the code
```

### Quick Orientation
```
get_project_info({})   // Type, version, workspaces
get_scripts({})        // Available commands
```

## Auto-Detection

- **Project root**: Found from any subdirectory
- **Type**: npm, cargo, python, go
- **Monorepo**: Workspaces detected automatically
- **Tech**: React, Vue, Next.js, Vite, etc.

## Works from any subdirectory
Auto-detects project root.

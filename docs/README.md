# Documentation

[← Back to repo](../)

## Guides

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started.md) | Installation, building, MCP configuration |
| [For AI Agents](for-ai-agents.md) | Tool selection guide, workflows, best practices |
| [Architecture](architecture.md) | Package dependencies, design patterns, code organization |

## Packages

See [packages/](packages/) for full package documentation.

| Package | Tools | Description |
|---------|-------|-------------|
| [syntax](packages/syntax.md) | 25 | Symbol-aware code operations |
| [history](packages/history.md) | 11 | Git operations |
| [project](packages/project.md) | 6 | Project orientation |
| [types](packages/types.md) | 4 | TypeScript checking |
| [task-runner](packages/task-runner.md) | 5 | Persistent task execution |
| [test-runner](packages/test-runner.md) | 6 | Structured test results |
| [insight](packages/insight.md) | 2 | Comprehensive code understanding |
| [preview](packages/preview.md) | 1 | Edit impact prediction |
| [board](packages/board.md) | 6 | Task tracking |
| [core](packages/core.md) | - | Shared utilities |

## Quick Reference

```bash
# Build
npm install && npm run build

# Test
npm test

# Regenerate docs
npm run generate:docs
```

## Generated Files

Documentation is partially generated from source code:
- `docs/packages/*.md` - Generated from package metadata and tool registrations
- `generated/packages.json` - Runtime package data
- `generated/tools.json` - Runtime tool data

Run `npm run generate:docs` after adding/changing tools.

---
name: insight
description: "Understand code in one call. Structure, relationships, history - all at once."
allowed-tools: mcp__insight__insight
---

# insight

**One call to understand anything. No more 5+ tool calls to figure out what a file does.**

## First: insight

```
insight({ target: 'src/TaskRunner.ts' })
```

Returns everything you need:
- Structure (symbols, imports, exports)
- Relationships (callers, callees, dependencies)
- Recent changes (git history)
- Metrics and notes

## Why This Wins

| The Problem | Multiple Tools | insight Solution |
|-------------|----------------|------------------|
| Understand a file | list_symbols + get_imports + git_log + ... | One `insight` call |
| Understand a class | read_symbol + get_callers + find_references + ... | One `insight` call |
| Understand a module | Read each file + trace dependencies + ... | One `insight` call |

## What You Get

### For a File
- Language and summary
- All symbols with kinds and lines
- Imports and exports
- Who imports this file
- Recent git changes
- Complexity metrics
- Notes (warnings, suggestions)

### For a Directory
- Summary of the module
- Files and subdirectories
- Entry points (index files)
- Key exported symbols
- External and internal dependencies
- Recent changes across all files

### For a Symbol
- Kind, file, line
- Full code
- Function signature
- What it calls
- What calls it
- Related symbols in same file
- Recent changes

## Examples

### Understand a file
```
insight({ target: 'src/server.ts' })
insight({ target: 'packages/syntax/src/tools/listSymbols.ts' })
```

### Understand a directory
```
insight({ target: 'src/utils' })
insight({ target: 'packages/task-runner' })
```

### Understand a symbol
```
insight({ target: 'TaskRunner' })
insight({ target: 'handleRequest' })
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| includeCode | true | Include source code in output |
| maxChanges | 5 | Max recent git commits to show |

## When to Use

- Starting work on unfamiliar code
- Before making changes (understand impact)
- Reviewing what a module does
- Getting oriented in a new codebase

## Derived, Not Stored

Everything is computed fresh from current code. Never stale.

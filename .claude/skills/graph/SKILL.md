---
name: graph
description: "Use for deep code understanding. Semantic call graphs, path tracing, symbol relationships. Initialize first, then query."
allowed-tools: mcp__graph__graph_initialize, mcp__graph__graph_get_symbol, mcp__graph__graph_get_callers, mcp__graph__graph_get_callees, mcp__graph__graph_trace, mcp__graph__graph_find_paths, mcp__graph__graph_find_symbols, mcp__graph__graph_find_dead_code, mcp__graph__graph_stats
---

# graph

**Semantic code understanding.** Know what calls what. Trace data flow. Find all paths between functions.

## WHEN TO USE GRAPH

Use graph tools when you need to understand **relationships between code**:
- "How does user input reach the database?"
- "What calls this function?"
- "If I change X, what else is affected?"
- "Find all functions matching a pattern"
- "What code is never called (dead code)?"

## WHEN NOT TO USE GRAPH

**Don't use graph for:**
- Reading/editing code → use `mcp__syntax__*` tools instead
- Finding a specific symbol → use `mcp__syntax__search_symbols`
- Type checking → use `mcp__types__get_diagnostics`
- Simple grep/file search → use `Grep` or `Glob` tools

**Graph is overkill for:**
- Single file operations
- Quick symbol lookups
- Code that doesn't have complex call relationships

## WORKFLOW

**Graph auto-initializes on startup** for the current working directory. For a different workspace:
```
1. graph_initialize({ workspace_path: '/other/project' })  // Re-index
2. graph_stats({})                                          // Verify
3. ... now use query tools ...
```

## TOOL REFERENCE

| Tool | Purpose | When to use |
|------|---------|-------------|
| `graph_initialize` | Index workspace | **FIRST** - before any queries |
| `graph_get_symbol` | Get symbol with source | Need full code for a function/class |
| `graph_get_callers` | Who calls this? | Impact analysis before changes |
| `graph_get_callees` | What does this call? | Understand function dependencies |
| `graph_trace` | Follow call chains | Trace data/control flow |
| `graph_find_paths` | All paths A→B | Security audits, data flow analysis |
| `graph_find_symbols` | Search by pattern/kind | Find all handlers, validators, etc. |
| `graph_find_dead_code` | Find unreachable functions | Clean up dead code |
| `graph_stats` | Index statistics | Verify initialization worked |

## COMPLEMENT TO SYNTAX

| If you need... | Use... |
|----------------|--------|
| Read/edit a single function | `mcp__syntax__*` tools |
| Understand call relationships | `mcp__graph__*` tools |
| Find symbol by name | `mcp__syntax__search_symbols` |
| Find all callers across codebase | `mcp__graph__graph_get_callers` |
| Edit code | `mcp__syntax__edit_symbol` |
| Trace impact of changes | `mcp__graph__graph_trace` |

## USE CASES

### Impact Analysis
"What breaks if I change `validateUser`?"
```
graph_get_callers({ symbol: 'validateUser' })
graph_trace({ symbol: 'validateUser', direction: 'backward', depth: 5 })
```

### Security Audit
"How does user input reach SQL queries?"
```
graph_find_paths({ from: 'handleRequest', to: 'executeQuery', max_depth: 10 })
```

### Code Discovery
"Find all handlers"
```
graph_find_symbols({ pattern: 'handle.*', kinds: ['function'] })
```

### Dead Code Detection
"What functions are never called?"
```
graph_find_dead_code({})
graph_find_dead_code({ file_pattern: 'src/**/*.ts' })  // Limit scope
```

### Understanding New Code
"What does this service do?"
```
graph_get_symbol({ name: 'UserService' })
graph_get_callees({ symbol: 'UserService' })
```

## Quick Examples

```
// Initialize (required first)
graph_initialize({ workspace_path: '/path/to/project' })

// Get symbol with full source code
graph_get_symbol({ name: 'processOrder' })

// Find all callers
graph_get_callers({ symbol: 'validateInput' })

// Trace forward from entry point
graph_trace({ symbol: 'handleRequest', direction: 'forward', depth: 4 })

// Find path between two functions
graph_find_paths({ from: 'parseInput', to: 'saveToDb' })

// Search by pattern
graph_find_symbols({ pattern: 'validate.*', kinds: ['function'] })
```

**Supports:** TypeScript, JavaScript, Python, Go, Rust (via tree-sitter)

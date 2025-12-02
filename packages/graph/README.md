# @agent-workbench/graph

Semantic code graph for AI agents. Trace call chains, find paths, understand relationships.

**Auto-initializes on startup** using current working directory.

## Multi-Language Support

Uses [tree-sitter](https://tree-sitter.github.io/) via `@agent-workbench/syntax` for accurate AST-based parsing.

| Language | Extensions | Status |
|----------|------------|--------|
| TypeScript | `.ts`, `.tsx` | Full support |
| JavaScript | `.js`, `.jsx` | Full support |
| Python | `.py` | Full support |
| Go | `.go` | Full support |
| Rust | `.rs` | Full support |

## Tools

| Tool | Description |
|------|-------------|
| `graph_initialize` | Index a workspace for graph analysis |
| `graph_get_symbol` | Get full symbol info including source code |
| `graph_get_callers` | Find all functions that call a symbol |
| `graph_get_callees` | Find all functions called by a symbol |
| `graph_trace` | Trace call chains forward or backward |
| `graph_find_paths` | Find all paths between two symbols |
| `graph_find_symbols` | Search symbols by pattern or kind |
| `graph_find_dead_code` | Find functions unreachable from exports |
| `graph_stats` | Get graph statistics (nodes, edges, files) |

### graph_initialize
Initialize the graph by indexing a workspace.

```typescript
graph_initialize({ workspace_path: "/path/to/project" })
```

### graph_get_symbol
Get full information about a symbol including source code.

```typescript
graph_get_symbol({ name: "processOrder" })
// Returns: { kind, name, file, line, source }
```

### graph_get_callers
Find all functions/methods that call a given symbol.

```typescript
graph_get_callers({ symbol: "validateInput" })
// Returns callers with source code snippets
```

### graph_get_callees
Find all functions/methods called by a given symbol.

```typescript
graph_get_callees({ symbol: "handleRequest" })
// Returns callees with source code snippets
```

### graph_trace
Trace call chains forward or backward from a symbol.

```typescript
// What does this function call? (forward)
graph_trace({ symbol: "main", direction: "forward", depth: 3 })

// Who calls this function? (backward)
graph_trace({ symbol: "saveToDb", direction: "backward", depth: 5 })
```

### graph_find_paths
Find all paths between two symbols.

```typescript
graph_find_paths({ from: "handleRequest", to: "saveToDb" })
// Returns: paths as arrays of symbol names
```

### graph_find_symbols
Search for symbols by pattern or kind.

```typescript
// Find by name pattern
graph_find_symbols({ pattern: "handle.*Request" })

// Find by kind
graph_find_symbols({ kinds: ["function", "method"] })

// Combined
graph_find_symbols({ pattern: "validate.*", kinds: ["function"], limit: 20 })
```

### graph_stats
Get statistics about the indexed graph.

```typescript
graph_stats()
// Returns: { nodes: 1014, edges: 2464, files: 117 }
```

### graph_find_dead_code
Find functions that are never called from any exported entry point.

```typescript
// Find unreachable functions in all files
graph_find_dead_code({})

// Limit to specific files
graph_find_dead_code({ file_pattern: "src/**/*.ts" })

// Include private class members
graph_find_dead_code({ include_private: true })
```

This tool uses call graph analysis to trace from exported symbols and find any functions that are never reached. More thorough than `find_unused_exports` because it considers transitive call chains.

## Architecture

```
graph/
├── model.ts       # Graph data model (Node, Edge, Path)
├── GraphStore.ts  # In-memory storage with BFS queries
├── Analyzer.ts    # Tree-sitter based code analysis
├── server.ts      # MCP server entry point
├── index.ts       # Package exports
└── tools/         # MCP tool definitions
    ├── initialize.ts
    ├── getSymbol.ts
    ├── getCallers.ts
    ├── getCallees.ts
    ├── trace.ts
    ├── findPaths.ts
    ├── findSymbols.ts
    ├── findDeadCode.ts
    └── getStats.ts
```

## Use Cases

### Understanding Code Flow
```typescript
// "How does data flow from API to database?"
graph_find_paths({ from: "handleApiRequest", to: "insertIntoDb" })
```

### Impact Analysis
```typescript
// "What might break if I change this function?"
graph_get_callers({ symbol: "formatDate" })
```

### Finding Entry Points
```typescript
// "Where is this used?"
graph_trace({ symbol: "validateUser", direction: "backward", depth: 10 })
```

### Discovering Patterns
```typescript
// "Find all handlers"
graph_find_symbols({ pattern: "handle.*" })

// "Find all async functions"
graph_find_symbols({ kinds: ["function"], pattern: ".*" })
```

### Finding Dead Code
```typescript
// "What code is never used?"
graph_find_dead_code({})

// Limit to source files only
graph_find_dead_code({ file_pattern: "src/**/*.ts" })
```

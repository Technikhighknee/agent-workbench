# @agent-workbench/graph

Semantic code graph for deep code understanding. Trace call chains, find paths, understand relationships.

**Auto-initializes on first query** using current working directory. **Auto-reindexes** when source files change.

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

### graph_initialize
Initialize the graph by indexing a workspace. Called automatically on first query.

```typescript
// Manual initialization (optional - auto-initializes on first query)
graph_initialize({ workspace_path: "/path/to/project" })
```

### graph_get_symbol
Get full information about a symbol including source code.

```typescript
graph_get_symbol({ name: "processOrder" })
// Returns: { kind, name, file, line, source, tags, ... }
```

### graph_get_callers
Find all functions/methods that call a given symbol.

```typescript
graph_get_callers({ symbol: "validateInput" })
// Returns: { nodes: [...callers], edges: [...call_edges] }
```

### graph_get_callees
Find all functions/methods called by a given symbol.

```typescript
graph_get_callees({ symbol: "handleRequest" })
// Returns: { nodes: [...callees], edges: [...call_edges] }
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
// Returns: { paths: [[node1, node2, node3], ...] }
```

### graph_find_symbols
Search for symbols by pattern, tags, or kind.

```typescript
// Find by name pattern
graph_find_symbols({ pattern: "handle.*Request" })

// Find by semantic tags
graph_find_symbols({ tags: ["handler", "async"] })

// Find by kind
graph_find_symbols({ kinds: ["function", "method"] })
```

### graph_query
Execute compound queries with traversal and filtering.

```typescript
graph_query({
  from: "UserController",
  direction: "forward",
  edge_kinds: ["calls"],
  max_depth: 3,
  min_confidence: 0.8
})
```

### graph_stats
Get statistics about the indexed graph.

```typescript
graph_stats()
// Returns: { nodes: 1014, edges: 2464, files: 117 }
```

## Semantic Tags

The analyzer automatically infers semantic tags from symbol names and content:

| Tag | Description | Examples |
|-----|-------------|----------|
| `handler` | Request/event handlers | `handleClick`, `onSubmit` |
| `getter` | Data getters | `getUser`, `fetchData` |
| `setter` | Data setters | `setUser`, `updateConfig` |
| `predicate` | Boolean checks | `isValid`, `hasPermission` |
| `factory` | Object creation | `createUser`, `buildQuery` |
| `transformer` | Data transformation | `parseJson`, `convertDate` |
| `validation` | Input validation | `validateEmail`, `checkInput` |
| `async` | Async operations | Contains `await` |
| `database` | Database operations | Contains SQL or ORM patterns |
| `http` | HTTP operations | Contains `fetch` |
| `throws` | Can throw errors | Contains `throw new` |
| `error-handling` | Error handling | Contains `try { ... }` |

## Architecture

```
graph/
├── core/
│   └── model.ts              # Graph data model (nodes, edges, queries)
├── infrastructure/
│   ├── GraphService.ts       # Main service with workspace indexing
│   ├── GraphStore.ts         # In-memory storage with indexes
│   ├── QueryEngine.ts        # Query execution and traversal
│   ├── TreeSitterAnalyzer.ts # AST-based analysis via tree-sitter
│   └── TypeScriptAnalyzer.ts # Legacy regex-based fallback
└── tools/
    └── index.ts              # MCP tool definitions
```

### Analyzer Selection

The graph package automatically selects the best analyzer:

1. **TreeSitterAnalyzer** (default) - Uses `@agent-workbench/syntax` for proper AST parsing
   - More accurate call detection
   - Multi-language support
   - Handles comments, strings, nested functions correctly

2. **TypeScriptAnalyzer** (fallback) - Regex-based parsing
   - Faster for simple cases
   - Used when tree-sitter is unavailable

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
graph_find_symbols({ tags: ["handler"] })

// "Find all database operations"
graph_find_symbols({ tags: ["database"] })
```

### Cross-Language Analysis
```typescript
// Analyze a mixed TypeScript/Python project
graph_initialize({ workspace_path: "/path/to/fullstack-project" })

// Find all async operations across languages
graph_find_symbols({ tags: ["async"] })
```

## Known Limitations

### MCP Server Native Module Loading

When running as an MCP server via stdio transport, tree-sitter native modules may not load correctly in some environments. This can cause the graph to fall back to TypeScript-only indexing.

**Workaround**: If you need multi-language support, use the `GraphService` as a library directly:

```typescript
import { GraphService } from "@agent-workbench/graph";

const graph = new GraphService();
await graph.initialize("/path/to/project");
// Python, Go, Rust files will be indexed
```

When used as a library, tree-sitter works correctly and all supported languages are indexed.

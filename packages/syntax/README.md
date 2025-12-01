# Syntax
> Symbol-aware code operations for AI agents. Read and edit code by function name, not line numbers.

Back to [main README.md](../../)

## Tools

### File Operations

| Tool | Description |
|------|-------------|
| `list_symbols` | List all symbols (functions, classes, etc.) in a source file |
| `read_symbol` | Read a specific symbol's code by name path (e.g., `MyClass/myMethod`) |
| `edit_symbol` | Replace a symbol's entire body by name path |
| `edit_lines` | Replace a range of lines by line number |

### Project Operations

| Tool | Description |
|------|-------------|
| `search_symbols` | Find symbols by pattern across all indexed files |
| `find_references` | Find all usages of a symbol throughout the codebase |
| `rename_symbol` | Rename a symbol across all files (supports dry_run) |
| `get_callers` | Find all functions that call a given function |
| `get_callees` | Find all functions called by a given function |

## Features

- **Auto-indexing** - Project indexed on startup, watches for file changes
- **Symbol-aware operations** - Work with functions and classes by name, not text
- **Hierarchical navigation** - `MyClass/myMethod` paths for nested symbols
- **Multi-language support** - TypeScript, JavaScript, Python, Go, Rust
- **Call hierarchy** - Understand code flow with get_callers/get_callees
- **Caching** - Parsed symbol trees cached with mtime invalidation
- **Tree-sitter parsing** - Fast, accurate syntax analysis

## Usage

### list_symbols

```typescript
// List all symbols in a file
list_symbols({ file_path: "src/app.ts" });

// Top-level only
list_symbols({ file_path: "src/app.ts", depth: 0 });

// Only functions and classes
list_symbols({ file_path: "src/app.ts", kinds: ["function", "class"] });
```

### read_symbol

```typescript
// Read a top-level function
read_symbol({ file_path: "src/utils.ts", name_path: "calculateTotal" });

// Read a class method
read_symbol({ file_path: "src/user.ts", name_path: "User/save" });

// Include context lines
read_symbol({ file_path: "src/utils.ts", name_path: "helper", context: 3 });
```

### edit_symbol

```typescript
// Replace a function
edit_symbol({
  file_path: "src/utils.ts",
  name_path: "calculateTotal",
  new_body: `function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}`
});
```

### search_symbols

```typescript
// Find all handlers
search_symbols({ pattern: "handle.*Request" });

// Find only functions
search_symbols({ pattern: "process.*", kinds: ["function"] });
```

### Call Hierarchy

```typescript
// Who calls this function?
get_callers({ symbol_name: "processData" });

// What does this function call?
get_callees({ file_path: "src/service.ts", symbol_name_path: "Service/run" });
```

## Supported Languages

| Language | Extensions | Symbol Kinds |
|----------|------------|--------------|
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | class, interface, function, method, property, variable, type_alias, enum, namespace |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | class, function, method, property, variable |
| Python | `.py`, `.pyi` | class, function, variable |
| Go | `.go` | function, method, type_alias, variable |
| Rust | `.rs` | struct, trait, function, impl, enum, type_alias, const, mod |

## Architecture

```
packages/syntax/
├── src/
│   ├── core/
│   │   ├── model.ts           # Symbol, SymbolKind, Location, Span
│   │   ├── symbolTree.ts      # SymbolTree utilities
│   │   ├── result.ts          # Result<T, E> type
│   │   ├── ports/             # Parser, FileSystem, Cache, FileWatcher interfaces
│   │   └── services/
│   │       ├── SyntaxService.ts   # File-level operations
│   │       └── ProjectIndex.ts    # Cross-file operations
│   │
│   ├── infrastructure/
│   │   ├── parsers/           # TreeSitterParser
│   │   ├── filesystem/        # NodeFileSystem
│   │   ├── cache/             # InMemoryCache
│   │   ├── scanner/           # NodeProjectScanner
│   │   └── watcher/           # NodeFileWatcher
│   │
│   ├── tools/                 # MCP tool definitions
│   ├── server.ts              # MCP server entry
│   └── index.ts               # Library exports
```

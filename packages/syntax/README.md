# Syntax
> Symbol-aware code operations for AI agents. Read and edit code by function name, not line numbers.

Back to [main README.md](../../)

## Installation

```bash
npm install @agent-workbench/syntax
```

## MCP Configuration

```json
{
  "mcpServers": {
    "syntax": {
      "command": "npx",
      "args": ["@agent-workbench/syntax"]
    }
  }
}
```

## Tools

### File Operations

| Tool | Description |
|------|-------------|
| `list_symbols` | List all symbols (functions, classes, etc.) in a source file |
| `read_symbol` | Read a specific symbol's code by name path (e.g., `MyClass/myMethod`) |
| `edit_symbol` | Replace a symbol's entire body by name path |
| `edit_lines` | Replace a range of lines by line number |
| `get_imports` | Get all import statements from a source file |
| `get_exports` | Get all export statements from a source file |

### Import Management

| Tool | Description |
|------|-------------|
| `add_import` | Add/merge import statements (merges with existing imports from same source) |
| `remove_unused_imports` | Find and remove imports that aren't used in a file |
| `organize_imports` | Sort and group imports by type or source |

### Project Operations

| Tool | Description |
|------|-------------|
| `search_symbols` | Find symbols by pattern across all indexed files |
| `find_references` | Find all usages of a symbol throughout the codebase |
| `rename_symbol` | Rename a symbol across all files (supports dry_run) |
| `get_callers` | Find all functions that call a given function |
| `get_callees` | Find all functions called by a given function |
| `analyze_deps` | Analyze dependencies and detect circular imports |
| `find_unused_exports` | Find exports that aren't imported anywhere |

### Refactoring

| Tool | Description |
|------|-------------|
| `move_file` | Move a file and update all imports across the codebase |
| `move_symbol` | Move a function/class to another file with import updates |
| `extract_function` | Extract code block into a new function (auto-detects parameters) |
| `inline_function` | Replace a function call with the function body |

### Multi-file Operations

| Tool | Description |
|------|-------------|
| `apply_edits` | Apply multiple edits across files atomically (all succeed or all fail with rollback) |
| `batch_edit_symbols` | Edit multiple symbols across files atomically with validation before apply |

## Features

- **Auto-indexing** - Project indexed on startup, watches for file changes
- **Symbol-aware operations** - Work with functions and classes by name, not text
- **Hierarchical navigation** - `MyClass/myMethod` paths for nested symbols
- **Multi-language support** - TypeScript, JavaScript, Python, Go, Rust
- **Call hierarchy** - Understand code flow with get_callers/get_callees
- **Import/Export analysis** - Extract, analyze, and manage import/export statements
- **Import management** - Add, remove unused, and organize imports automatically
- **Safe refactoring** - Move files/symbols with automatic import updates (dry_run support)
- **Extract & inline** - Extract code to functions, inline function calls
- **Dead code detection** - Find unused exports across the codebase
- **Atomic multi-file edits** - Apply edits across multiple files with rollback on failure
- **Dependency analysis** - Detect circular dependencies and analyze coupling
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

### get_imports / get_exports

```typescript
// Get all imports from a file
get_imports({ file_path: "src/app.ts" });
// Returns: source, type (default/named/namespace/type/side_effect), bindings, line

// Get all exports from a file
get_exports({ file_path: "src/app.ts" });
// Returns: type (default/named/declaration/reexport/namespace), bindings, source (for re-exports)
```

### Call Hierarchy

```typescript
// Who calls this function?
get_callers({ symbol_name: "processData" });

// What does this function call?
get_callees({ file_path: "src/service.ts", symbol_name_path: "Service/run" });
```

### analyze_deps

```typescript
// Analyze project dependencies
analyze_deps({});
// Returns: circular dependencies, most imported files, files with most imports
```

### Import Management

```typescript
// Add an import (merges with existing imports from same source)
add_import({ file_path: "src/app.ts", source: "./utils", names: ["formatDate", "parseDate"] });

// Add default import
add_import({ file_path: "src/app.ts", source: "react", default_import: "React" });

// Add type-only import
add_import({ file_path: "src/app.ts", source: "./types", names: ["User"], type_only: true });

// Remove unused imports
remove_unused_imports({ file_path: "src/app.ts", dry_run: true });  // Preview
remove_unused_imports({ file_path: "src/app.ts" });  // Execute

// Organize imports (sort and group)
organize_imports({ file_path: "src/app.ts", group_style: "source" });  // Group by external/internal
organize_imports({ file_path: "src/app.ts", group_style: "type" });    // Group by import type
```

### Refactoring

```typescript
// Move a file and update all imports
move_file({ source: "src/utils.ts", destination: "src/lib/utils.ts", dry_run: true });  // Preview
move_file({ source: "src/utils.ts", destination: "src/lib/utils.ts" });  // Execute

// Move a function to another file
move_symbol({
  source_file: "src/utils.ts",
  symbol_name: "formatDate",
  destination_file: "src/dateUtils.ts",
  dry_run: true
});

// Extract code block into a new function
extract_function({
  file_path: "src/handler.ts",
  start_line: 45,
  end_line: 60,
  function_name: "validateInput",
  dry_run: true
});

// Inline a function call (replace with function body)
inline_function({ file_path: "src/handler.ts", line: 23, dry_run: true });

// Find unused exports
find_unused_exports({});  // All files
find_unused_exports({ file_pattern: "src/**/*.ts" });  // Specific pattern
```

### Multi-file Atomic Edits

```typescript
// Apply multiple edits across files atomically
apply_edits({
  edits: [
    { file_path: "src/api.ts", old_string: "foo", new_string: "bar" },
    { file_path: "src/types.ts", old_string: "foo", new_string: "bar" },
    { file_path: "src/tests.ts", old_string: "foo", new_string: "bar", replace_all: true }
  ],
  dry_run: true  // Preview first
});

// All edits validated before any are applied
// If one fails, none are applied (atomic)
// On write failure, already-applied edits are rolled back
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

# Syntax
> Symbol-aware code operations for AI agents. Read and edit code by function name, not line numbers.

Back to [main README.md](../../)

## Tools

| Tool | Description |
|------|-------------|
| `list_symbols` | List all symbols (functions, classes, etc.) in a source file. Returns hierarchical structure with line numbers. |
| `read_symbol` | Read a specific symbol's code by name path (e.g., `MyClass/myMethod`). Targeted reading saves context. |
| `edit_symbol` | Replace a symbol's entire body by name path. More reliable than text-based matching. |
| `edit_lines` | Replace a range of lines by line number. No need for exact text matching. |

## Features

- **Symbol-aware operations** - Work with functions and classes by name, not text
- **Hierarchical navigation** - `MyClass/myMethod` paths for nested symbols
- **Multi-language support** - TypeScript, JavaScript, Python, Go, Rust
- **Caching** - Parsed symbol trees cached with mtime invalidation
- **Tree-sitter parsing** - Fast, accurate syntax analysis

## Usage

### list_symbols

```typescript
// List all symbols in a file
await syntax.list_symbols({ file_path: "src/app.ts" });

// Top-level only
await syntax.list_symbols({ file_path: "src/app.ts", depth: 0 });

// Only functions and classes
await syntax.list_symbols({
  file_path: "src/app.ts",
  kinds: ["function", "class"]
});
```

### read_symbol

```typescript
// Read a top-level function
await syntax.read_symbol({
  file_path: "src/utils.ts",
  name_path: "calculateTotal"
});

// Read a class method
await syntax.read_symbol({
  file_path: "src/user.ts",
  name_path: "User/save"
});

// Include context lines
await syntax.read_symbol({
  file_path: "src/utils.ts",
  name_path: "helper",
  context: 3
});
```

### edit_symbol

```typescript
// Replace a function
await syntax.edit_symbol({
  file_path: "src/utils.ts",
  name_path: "calculateTotal",
  new_body: `function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}`
});
```

### edit_lines

```typescript
// Replace lines 10-15
await syntax.edit_lines({
  file_path: "src/config.ts",
  start_line: 10,
  end_line: 15,
  new_content: "const config = { debug: true };"
});
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
│   │   ├── ports/             # Parser, FileSystem, Cache interfaces
│   │   └── services/          # SyntaxService (main orchestrator)
│   │
│   ├── infrastructure/
│   │   ├── parsers/           # TreeSitterParser
│   │   ├── filesystem/        # NodeFileSystem
│   │   └── cache/             # InMemoryCache
│   │
│   ├── tools/                 # MCP tool definitions
│   ├── server.ts              # MCP server entry
│   └── index.ts               # Library exports
```

## Evolution Roadmap

**Phase 1 (Current):** Symbol-aware file operations
- list_symbols, read_symbol, edit_symbol, edit_lines

**Phase 2:** Cross-file awareness
- find_references, find_usages
- rename_symbol (across files)
- import management

**Phase 3:** Code intelligence
- go_to_definition
- get_type_info
- get_diagnostics

**Phase 4:** Refactoring
- extract_function, extract_variable
- inline_symbol
- move_symbol

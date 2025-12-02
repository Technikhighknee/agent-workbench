# @agent-workbench/types

TypeScript language service integration for AI agents. Get type errors, hover info, go-to-definition, and quick fixes.

**INSTEAD OF:** `tsc --noEmit` in Bash (which can timeout or produce noisy output).

## Why types?

The TypeScript compiler API gives you:
- Real-time type checking without running `tsc`
- Hover information (what type is this variable?)
- Jump to definition (where is this function defined?)
- Quick fixes (auto-import, fix spelling, etc.)
- All without parsing CLI output

## Tools

### get_diagnostics
Get type errors, warnings, and suggestions.

```typescript
// Check specific file
get_diagnostics({ file: "src/index.ts" })

// Check entire project with limit
get_diagnostics({ limit: 20 })

// Only errors, no warnings
get_diagnostics({ errors_only: true })
```

Returns structured diagnostics:
```typescript
{
  file: "src/index.ts",
  line: 42,
  column: 10,
  message: "Property 'foo' does not exist on type 'Bar'",
  severity: "error",  // or "warning", "suggestion", "hint"
  code: 2339
}
```

### get_type_at_position
Get type information at a cursor position (like IDE hover).

```typescript
get_type_at_position({
  file: "src/index.ts",
  line: 10,
  column: 15
})
// Returns: { type: "string[]", documentation: "Array of names" }
```

### go_to_definition
Find where a symbol is defined.

```typescript
go_to_definition({
  file: "src/index.ts",
  line: 10,
  column: 15
})
// Returns: { file: "src/types.ts", line: 5, column: 1 }
```

### find_type_references
Find all usages of a symbol (type-aware, more accurate than grep).

```typescript
find_type_references({
  file: "src/types.ts",
  line: 5,
  column: 10
})
// Returns array of { file, line, column } locations
```

### get_quick_fixes
Get available auto-fixes for errors at a position.

```typescript
get_quick_fixes({
  file: "src/index.ts",
  line: 10,
  column: 5
})
// Returns: [{ title: "Add missing import", edits: [...] }]
```

### notify_file_changed
Tell the service a file was modified (call after edits).

```typescript
notify_file_changed({ file: "src/index.ts" })
// Or with new content:
notify_file_changed({ file: "src/index.ts", content: "..." })
```

### reload
Re-scan for TypeScript projects. Use when:
- New packages added to monorepo
- New tsconfig.json created
- Major restructuring

```typescript
reload()
// Returns: { projects: 5, files: 234 }
```

## Use Cases

### Check if edits broke types
```typescript
// After editing code
await notify_file_changed({ file: editedFile });
const result = await get_diagnostics({ file: editedFile });
if (result.value.some(d => d.severity === "error")) {
  // Fix the errors
}
```

### Understand unfamiliar code
```typescript
// What is this variable?
const type = await get_type_at_position({ file, line: 42, column: 10 });
console.log(type.type);  // "Promise<User[]>"

// Where is it defined?
const def = await go_to_definition({ file, line: 42, column: 10 });
// Jump to definition file
```

### Auto-fix imports
```typescript
const fixes = await get_quick_fixes({ file, line: 1, column: 1 });
const importFix = fixes.find(f => f.title.includes("import"));
// Apply the fix
```

## Architecture

```
types/
├── src/
│   ├── infrastructure/typescript/
│   │   ├── TypeScriptService.ts   # Core TS language service wrapper
│   │   └── LanguageServiceHost.ts # TS compiler host implementation
│   ├── tools/                     # MCP tool definitions
│   └── server.ts                  # MCP server entry point
└── test/
    └── TypeScriptService.test.ts
```

## Multi-Project Support

The service automatically discovers all `tsconfig.json` files in the workspace:

```
monorepo/
├── tsconfig.json          # Root config
├── packages/
│   ├── core/tsconfig.json
│   ├── api/tsconfig.json
│   └── web/tsconfig.json
```

Each project is loaded independently with proper references.

## Performance Notes

- First `get_diagnostics` may be slow (compiling project)
- Subsequent calls are fast (incremental checking)
- `notify_file_changed` keeps the service in sync
- Large monorepos (1000+ files) may have startup delay

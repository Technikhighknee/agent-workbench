# @agent-workbench/types

Fast, single-file TypeScript type checking for AI agents. Never hangs - all operations complete in <5 seconds.

**INSTEAD OF:** `tsc --noEmit` in Bash (which can timeout or produce noisy output).

## Installation

```bash
npm install @agent-workbench/types
```

## MCP Configuration

```json
{
  "mcpServers": {
    "types": {
      "command": "npx",
      "args": ["@agent-workbench/types"]
    }
  }
}
```

## Design Philosophy

- **Single file focus** - Optimized for checking ONE file at a time
- **Stateless** - Reads fresh from disk every time, never stale
- **5 second timeout** - All operations fail fast, never hang
- **For project-wide checks** - Use `tsc --noEmit` via task_runner

## Tools

### check_file
Check a single file for type errors. This is the primary operation - fast and focused.

```typescript
check_file({ file: "src/api.ts" })
```

Returns structured diagnostics:
```typescript
{
  file: "src/api.ts",
  line: 42,
  column: 10,
  message: "Property 'foo' does not exist on type 'Bar'",
  severity: "error",  // or "warning", "info", "hint"
  code: "2339"
}
```

### get_type
Get type information at a cursor position (like IDE hover).

```typescript
get_type({
  file: "src/api.ts",
  line: 10,
  column: 15
})
// Returns: { type: "string[]", name: "users", kind: "variable" }
```

### go_to_definition
Find where a symbol is defined.

```typescript
go_to_definition({
  file: "src/api.ts",
  line: 10,
  column: 15
})
// Returns: [{ file: "src/types.ts", line: 5, column: 1, name: "User", kind: "interface" }]
```

### get_quick_fixes
Get available auto-fixes for errors at a position.

```typescript
get_quick_fixes({
  file: "src/api.ts",
  line: 10,
  column: 5
})
// Returns: [{ title: "Add missing import", edits: [...] }]
```

## Use Cases

### After Every Edit
```typescript
// Verify your changes don't break types
check_file({ file: "src/edited.ts" })
```

### Understanding Unknown Code
```typescript
// What type is this variable?
get_type({ file: "src/api.ts", line: 42, column: 10 })

// Where is it defined?
go_to_definition({ file: "src/api.ts", line: 42, column: 10 })
```

### Fixing Type Errors
```typescript
// Find errors
check_file({ file: "src/broken.ts" })

// Get auto-fix suggestions
get_quick_fixes({ file: "src/broken.ts", line: 10, column: 5 })
```

### Project-Wide Checks
```typescript
// Use task_runner for full project type checking
task_run({ command: "tsc --noEmit" })
```

## Architecture

```
types/
├── src/
│   ├── TypeChecker.ts            # Core stateless type checker
│   ├── tools/                    # MCP tool definitions
│   │   ├── checkFile.ts
│   │   ├── getType.ts
│   │   ├── goToDefinition.ts
│   │   └── getQuickFixes.ts
│   └── server.ts                 # MCP server entry point
└── test/
    └── TypeChecker.test.ts
```

## Performance

- All operations complete in <5 seconds (hard timeout)
- Each call creates fresh TypeScript program (no stale cache)
- First call may be slower (project discovery)
- Subsequent calls benefit from warm TypeScript instance

## Stability

- 0% error rate under concurrent load (stress tested)
- Graceful handling of missing/invalid files
- Memory-stable across repeated operations

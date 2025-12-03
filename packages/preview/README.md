# @agent-workbench/preview

Impact preview and consequence analysis for AI agents. See what happens before you edit.

## Why This Package?

AI agents make many edits. Knowing the consequences beforehand prevents cascading errors:
- **Will this break types?** → Predicts type errors before editing
- **What tests need to run?** → Discovers related tests
- **Who calls this code?** → Shows affected callers
- **What's the impact?** → Comprehensive consequence analysis

## Tools

| Tool | Description |
|------|-------------|
| `preview_edit` | Preview consequences of an edit before applying it |

## Installation

```bash
npm install @agent-workbench/preview
```

## MCP Configuration

```json
{
  "mcpServers": {
    "preview": {
      "command": "npx",
      "args": ["@agent-workbench/preview"]
    }
  }
}
```

## Usage Examples

### Preview a Symbol Edit
```
preview_edit {
  "file_path": "src/utils.ts",
  "symbol_name": "calculateTotal",
  "new_code": "function calculateTotal(items: Item[]): number {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}"
}
```

Returns:
- Predicted type errors
- Affected callers
- Related tests
- Impact summary

### Preview Options
```
preview_edit {
  "file_path": "src/api.ts",
  "symbol_name": "fetchUser",
  "new_code": "...",
  "check_types": true,
  "find_callers": true,
  "find_tests": true
}
```

## How It Works

1. **Virtual Edit** - Creates in-memory version with changes applied
2. **Type Checking** - Runs TypeScript compiler against virtual state
3. **Caller Analysis** - Finds all code that calls the modified symbol
4. **Test Discovery** - Locates tests for affected files
5. **Impact Report** - Summarizes consequences

## Architecture

```
src/
├── PreviewService.ts    # Core preview logic
├── tools/
│   ├── previewEdit.ts   # MCP tool implementation
│   └── index.ts         # Tool registration
├── server.ts            # MCP server entry point
└── index.ts             # Library exports
```

## Use Cases

- **Pre-flight checks** - Validate changes before applying
- **Impact assessment** - Understand scope of changes
- **Test planning** - Know which tests to run
- **Safe refactoring** - Catch breaking changes early

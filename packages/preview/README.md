# @agent-workbench/preview

Impact preview and consequence analysis for AI agents. See what happens before you edit.

## Why This Package?

AI agents make many edits. Knowing the consequences beforehand prevents cascading errors:
- **Will this break types?** - Predicts type errors before editing
- **What tests need to run?** - Discovers related tests
- **Who calls this code?** - Shows affected callers
- **What's the impact?** - Comprehensive consequence analysis

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
  "file": "src/utils.ts",
  "edit_type": "symbol",
  "symbol": "calculateTotal",
  "new_content": "function calculateTotal(items: Item[]): number {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}"
}
```

Returns:
- Predicted type errors
- Affected callers
- Related tests
- Impact summary

### Edit Types

| edit_type | Required fields | Description |
|-----------|-----------------|-------------|
| `symbol` | `symbol`, `new_content` | Replace a symbol by name |
| `text` | `old_text`, `new_content` | Text replacement |
| `create` | `new_content` | Create new file |
| `delete` | - | Delete file |

### Preview Options
```
preview_edit {
  "file": "src/api.ts",
  "edit_type": "symbol",
  "symbol": "fetchUser",
  "new_content": "...",
  "check_types": true,
  "analyze_callers": true,
  "find_tests": true
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `check_types` | true | Run TypeScript type checking |
| `analyze_callers` | true | Find all code that calls this symbol |
| `find_tests` | true | Discover related test files |

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
│   └── previewEdit.ts   # MCP tool implementation
├── server.ts            # MCP server entry point
└── index.ts             # Library exports
```

## Use Cases

- **Pre-flight checks** - Validate changes before applying
- **Impact assessment** - Understand scope of changes
- **Test planning** - Know which tests to run
- **Safe refactoring** - Catch breaking changes early

## The Workflow

1. **Think** - "I want to change this function"
2. **Preview** - `preview_edit({ ... })` - see consequences
3. **Decide** - Is this change safe? What needs updating?
4. **Edit** - Make the change with confidence
5. **Verify** - Run the tests you now know to run

## Stability

- 0% error rate under stress testing
- Graceful handling of missing files
- Works with any TypeScript project

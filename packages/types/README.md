# @agent-workbench/types

MCP server for TypeScript language service integration. Get type errors, hover info, and go-to-definition.

## Tools

### `get_diagnostics`
Get TypeScript type errors, warnings, and suggestions for a file or the entire project.

### `get_type_at_position`
Get type information at a specific position (hover info).

### `go_to_definition`
Find the definition location of a symbol.

### `find_type_references`
Find all references to a symbol using the type system.

### `get_quick_fixes`
Get available quick fixes and code actions.

### `notify_file_changed`
Notify the service that a file has changed.

## Usage

```bash
npm install
npm run build
node dist/server.js
```

The server auto-initializes by finding `tsconfig.json` in the working directory.

## Configuration

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "types": {
      "command": "node",
      "args": ["/path/to/packages/types/dist/server.js"]
    }
  }
}
```

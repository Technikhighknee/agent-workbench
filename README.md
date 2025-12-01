# agent-workbench

Inspired by the concept of IDE – translated into the world of AI-Agents.

## Packages

### [@agent-workbench/syntax](packages/syntax/)
Symbol-aware code operations for AI agents. Read and edit code by function/class name, not line numbers.

- `list_symbols` - Get file structure
- `read_symbol` / `edit_symbol` - Read/write by symbol name
- `get_imports` / `get_exports` - Analyze module boundaries
- `search_symbols` / `find_references` - Cross-file search
- `get_callers` / `get_callees` - Call hierarchy
- `analyze_deps` - Circular dependency detection
- `rename_symbol` - Safe cross-file renaming

### [@agent-workbench/process-host](packages/process-host/)
Process management with persistent tracking, log capture, and lifecycle control.

- `run_process` - Run command, wait for completion
- `spawn_process` - Start background process
- `get_logs` / `search_logs` - Monitor output
- `stop_process` / `restart_process` - Lifecycle control
- `wait_for_pattern` - Block until output matches

## Quick Start

```bash
npm install
npm run build
```

Each package runs as an MCP server. See individual package READMEs for configuration.

---
name: core
tagline: "Shared utilities for all packages."
---

# core

**Not an MCP server.** Shared utilities used by all packages.

## Provides

### Result Type
```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Explicit error handling without exceptions:
- `Ok(value)` / `Err(error)` - create results
- `map`, `andThen`, `unwrapOr` - transform results
- `tryCatch`, `tryCatchAsync` - wrap exceptions

### MCP Helpers
```typescript
textResponse(text)       // Create text response
errorResponse(message)   // Create error response
resultToResponse(result) // Convert Result to MCP response
```

### Server Bootstrap
```typescript
runServer({
  config: { name: 'my-server', version: '1.0.0' },
  createServices: () => ({ service: new MyService() }),
  registerTools: (server, services) => { ... },
  onStartup: async (services) => { ... },
  onShutdown: (services) => { ... }
})
```

## Usage

```typescript
import { Ok, Err, Result, runServer } from '@agent-workbench/core';
```

## Not for Direct Use

This package provides infrastructure for other packages. You don't interact with it directly through MCP tools.

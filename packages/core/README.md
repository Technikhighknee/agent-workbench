# @agent-workbench/core

Shared utilities for agent-workbench packages.

## Result Type

Explicit error handling without exceptions crossing boundaries.

```typescript
import { Result, Ok, Err, isOk, isErr } from "@agent-workbench/core";

// Create results
const success: Result<number, Error> = Ok(42);
const failure: Result<number, Error> = Err(new Error("Something went wrong"));

// Check and unwrap
if (isOk(result)) {
  console.log(result.value); // TypeScript knows this is safe
}

// Transform values
const doubled = map(success, (n) => n * 2); // Ok(84)

// Chain operations
const chained = andThen(success, (n) =>
  n > 0 ? Ok(n * 2) : Err(new Error("Must be positive"))
);

// Get value with default
const value = unwrapOr(failure, 0); // 0

// Combine multiple results
const combined = all([Ok(1), Ok(2), Ok(3)]); // Ok([1, 2, 3])

// Wrap exceptions
const safe = tryCatch(() => JSON.parse(input));
const safeAsync = await tryCatchAsync(() => fetch(url));
```

## MCP Response Utilities

Helpers for creating consistent MCP tool responses.

```typescript
import {
  textResponse,
  errorResponse,
  successResponse,
  resultToResponse,
  resultToStructuredResponse
} from "@agent-workbench/core";

// Simple text response
return textResponse("Operation completed");

// Error response
return errorResponse("File not found");

// Success with structured data
return successResponse("Created 5 files", { count: 5, files: [...] });

// Convert Result to response
return resultToResponse(result, (value) =>
  textResponse(`Found ${value.length} items`)
);

// Convert Result with structured content
return resultToStructuredResponse(result, (value) => ({
  text: `Found ${value.length} items`,
  data: { count: value.length, items: value }
}));
```

## API Reference

### Result Type
- `Ok<T>(value)` - Create success result
- `Err<E>(error)` - Create error result
- `isOk(result)` - Type guard for success
- `isErr(result)` - Type guard for error
- `map(result, fn)` - Transform success value
- `mapErr(result, fn)` - Transform error
- `andThen(result, fn)` - Chain operations (flatMap)
- `unwrapOr(result, default)` - Get value or default
- `unwrapOrElse(result, fn)` - Get value or compute default
- `unwrap(result)` - Get value or throw (use sparingly)
- `all(results)` - Combine array of results
- `tryCatch(fn)` - Wrap sync function
- `tryCatchAsync(fn)` - Wrap async function

### MCP Helpers
- `textResponse(text)` - Simple text response
- `errorResponse(message)` - Error with structured content
- `successResponse(text, data?)` - Success with optional structured content
- `resultToResponse(result, formatter)` - Convert Result to response
- `resultToStructuredResponse(result, formatter)` - Convert with structured data

## Server Utilities

Simplified MCP server creation with lifecycle hooks.

```typescript
import { runServer } from "@agent-workbench/core";

runServer({
  config: {
    name: "my-server",
    version: "1.0.0",
  },
  createServices: () => ({
    myService: new MyService(),
  }),
  registerTools: (server, services) => {
    server.registerTool("my_tool", { ... }, async (args) => {
      return services.myService.doSomething(args);
    });
  },
  onStartup: async (services) => {
    await services.myService.initialize();
  },
  onShutdown: (services) => {
    services.myService.dispose();
  },
});
```

### Server API
- `runServer(options)` - Start an MCP server with lifecycle management
- `bootstrapServer(options)` - Lower-level server creation for custom setups
- `McpServer` - Re-exported MCP SDK server type

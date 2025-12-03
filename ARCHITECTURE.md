# Architecture

This document explains the design decisions and patterns used throughout agent-workbench.

## Monorepo Structure

```
agent-workbench/
├── packages/
│   ├── core/         # Shared utilities (Result type, MCP bootstrap)
│   ├── syntax/       # Code parsing and symbol operations
│   ├── history/      # Git operations
│   ├── project/      # Project info and structure
│   ├── types/        # TypeScript type checking
│   ├── test-runner/  # Test execution
│   ├── task-runner/  # Background task management
│   ├── insight/      # Code analysis (combines syntax + history)
│   ├── preview/      # Edit impact prediction
│   └── board/        # Task tracking for agents
├── .claude/
│   └── skills/       # AI agent skill documentation
└── scripts/          # Build and utility scripts
```

### Why Monorepo?

1. **Shared patterns** - The `core` package provides utilities used everywhere
2. **Coordinated releases** - Packages evolve together
3. **Easier testing** - Integration tests can span packages
4. **Single toolchain** - One tsconfig, one test runner, one build system

### Why Separate Packages?

1. **Independent MCP servers** - Each package runs as its own server
2. **Focused responsibility** - Each solves one problem well
3. **Selective installation** - Users can install only what they need
4. **Parallel development** - Teams can work independently

## Package Dependency Graph

```
                              ┌───────────┐
                              │   core    │
                              └─────┬─────┘
                                    │
        ┌───────┬───────┬───────┬───┴───┬───────┬───────┐
        │       │       │       │       │       │       │
        ▼       ▼       ▼       ▼       ▼       ▼       ▼
    ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┐
    │syntax │history│project│ types │task-  │ board │insight│
    │       │       │       │       │runner │       │       │
    └───┬───┴───────┴───────┴───┬───┴───┬───┴───────┴───┬───┘
        │                       │       │               │
        │                       │       │               │
        │       ┌───────────────┘       │     (uses syntax)
        │       │                       │
        ▼       ▼                       ▼
    ┌───────────────┐           ┌───────────────┐
    │    preview    │           │  test-runner  │
    │(syntax+types) │           │ (task-runner) │
    └───────────────┘           └───────────────┘
```

**10 packages total:**
- **core** - Shared utilities (no external dependencies)
- **syntax** - Code parsing and symbol operations
- **history** - Git operations
- **project** - Project info and structure
- **types** - TypeScript type checking
- **task-runner** - Background task management
- **board** - Task tracking for agents
- **test-runner** - Test execution (depends on task-runner)
- **insight** - Code analysis (depends on syntax)
- **preview** - Edit impact prediction (depends on syntax, types)

**Build order matters:**
1. `core` - No dependencies, build first
2. `syntax`, `history`, `project`, `types`, `task-runner`, `board` - Depend only on `core`
3. `test-runner` - Depends on `task-runner`
4. `insight`, `preview` - Depend on `syntax`, `types`

## Design Patterns

### Result Type (Error Handling)

We use a `Result<T, E>` type instead of exceptions for explicit error handling:

```typescript
// From @agent-workbench/core
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

**Why?**
- Errors are visible in type signatures
- No hidden control flow from exceptions
- Composable with `map`, `andThen`, `unwrapOr`
- Consistent pattern across all packages

**Usage pattern:**

```typescript
import { Ok, Err, type Result } from "@agent-workbench/core";

function parseConfig(path: string): Result<Config, Error> {
  try {
    const content = fs.readFileSync(path, "utf-8");
    return Ok(JSON.parse(content));
  } catch (e) {
    return Err(new Error(`Failed to parse config: ${e}`));
  }
}

// Caller handles both cases explicitly
const result = parseConfig("./config.json");
if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

### Ports and Adapters (Hexagonal Architecture)

Domain logic is separated from infrastructure through interfaces (ports):

```
┌──────────────────────────────────────────────────────────────────┐
│                         MCP Tools (entry)                        │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Domain Services                             │
│                   (SyntaxService, BoardService, etc.)            │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Ports (interfaces)                       │
│                     (FileSystem, Storage, etc.)                  │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Infrastructure (adapters)                     │
│                  (NodeFileSystem, BoardStorage)                  │
└──────────────────────────────────────────────────────────────────┘
```

**Example port:**

```typescript
// packages/syntax/src/core/ports/FileSystem.ts
export interface FileSystem {
  read(filePath: string): Result<string, Error>;
  write(filePath: string, content: string): Result<void, Error>;
  exists(filePath: string): boolean;
  stats(filePath: string): Result<FileStats, Error>;
  delete(filePath: string): Result<void, Error>;
  rename(oldPath: string, newPath: string): Result<void, Error>;
}
```

**Why?**
- Domain logic is testable without real file system
- Easy to swap implementations (e.g., in-memory for tests)
- Clear boundaries between business logic and I/O

### Server Bootstrap Pattern

Each package uses a standardized bootstrap from `@agent-workbench/core`:

```typescript
// packages/*/src/server.ts
import { runServer } from "@agent-workbench/core";

runServer({
  config: { name: "agent-workbench:my-server", version: "0.1.0" },

  createServices: () => ({
    myService: new MyService()
  }),

  registerTools: (server, services) => {
    registerAllTools(server, services.myService);
  },

  onStartup: async (services) => {
    await services.myService.initialize(process.cwd());
  },

  onShutdown: (services) => {
    services.myService.dispose();
  },
});
```

**Why?**
- Consistent lifecycle across all packages
- Automatic signal handling (SIGTERM, SIGINT)
- Clear separation: service creation → tool registration → startup → shutdown
- Reduced boilerplate

## Package Structure

Each package follows a consistent internal structure:

```
src/
├── core/               # Domain logic
│   ├── model.ts        # Types and interfaces
│   ├── services/       # Business logic services
│   └── ports/          # Interfaces for external dependencies
├── infrastructure/     # External adapters (optional)
│   └── NodeFileSystem.ts
├── tools/              # MCP tool implementations
│   ├── index.ts        # Registers all tools
│   └── *.ts            # Individual tool files
└── server.ts           # Entry point (bootstraps MCP server)
```

**Naming conventions:**
- Files: `camelCase.ts` for modules, `PascalCase.ts` for classes
- Types/Interfaces: `PascalCase`
- Functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE` or `camelCase`

## MCP Tool Design

Tools follow consistent patterns:

```typescript
server.registerTool(
  "tool_name",
  {
    title: "Human readable title",
    description: "What the tool does, when to use it",
    inputSchema: { /* zod schema */ },
    outputSchema: { /* zod schema */ },
  },
  async (input): Promise<ToolResponse<Output>> => {
    // Implementation
    return {
      content: [{ type: "text", text: "Human readable output" }],
      structuredContent: { /* typed output */ },
    };
  }
);
```

**Guidelines:**
- Tool names use `snake_case`
- Descriptions explain the "when" and "why", not just "what"
- Both text and structured output for flexibility
- Input/output schemas for validation and documentation

## Error Handling Philosophy

1. **Never throw** across package boundaries - use `Result<T, E>`
2. **Validate early** - check inputs at the tool layer
3. **Fail gracefully** - return informative error messages
4. **No silent failures** - errors are always surfaced to the caller

## Testing Strategy

- **Unit tests** - Domain logic with mocked ports
- **Integration tests** - Real file system operations
- **Vitest** - Single test runner across all packages

Run tests:
```bash
npm test              # All tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Key Interfaces

### Most Imported

The dependency analysis shows the most central interfaces:

| File | Import Count | Purpose |
|------|-------------|---------|
| `syntax/tools/types.ts` | 25 | Tool response types |
| `syntax/core/model.ts` | 24 | Symbol and AST types |
| `syntax/core/services/SyntaxService.ts` | 18 | Code parsing service |
| `syntax/core/services/ProjectIndex.ts` | 17 | Cross-file indexing |

### No Circular Dependencies

The codebase maintains zero circular dependencies between packages. This is verified by `mcp__syntax__analyze_deps`.

# Getting Started

[← Back to docs](README.md)

## Prerequisites

- Node.js 18+
- npm 9+

## Installation

```bash
git clone https://github.com/Technikhighknee/agent-workbench.git
cd agent-workbench
npm install
npm run build
```

## MCP Configuration

Each package runs as an MCP server. Add them to your MCP client configuration.

### All Packages

```json
{
  "mcpServers": {
    "syntax": {
      "command": "npx",
      "args": ["@agent-workbench/syntax"]
    },
    "history": {
      "command": "npx",
      "args": ["@agent-workbench/history"]
    },
    "project": {
      "command": "npx",
      "args": ["@agent-workbench/project"]
    },
    "types": {
      "command": "npx",
      "args": ["@agent-workbench/types"]
    },
    "task-runner": {
      "command": "npx",
      "args": ["@agent-workbench/task-runner"]
    },
    "test-runner": {
      "command": "npx",
      "args": ["@agent-workbench/test-runner"]
    },
    "insight": {
      "command": "npx",
      "args": ["@agent-workbench/insight"]
    },
    "preview": {
      "command": "npx",
      "args": ["@agent-workbench/preview"]
    },
    "board": {
      "command": "npx",
      "args": ["@agent-workbench/board"]
    }
  }
}
```

### Development Mode (from source)

When developing locally, use tsx to run from source:

```json
{
  "mcpServers": {
    "syntax": {
      "command": "npx",
      "args": ["-y", "tsx", "packages/syntax/src/server.ts"]
    }
  }
}
```

## Build Commands

```bash
npm run build              # Build all packages
npm run build:syntax       # Build specific package
npm test                   # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage
```

## Next Steps

- [For AI Agents](for-ai-agents.md) - Learn which tools to use
- [Packages](packages/) - Explore individual packages
- [Architecture](architecture.md) - Understand the design

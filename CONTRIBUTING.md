# Contributing to Agent Workbench

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- **Node.js** 18+
- **npm** 9+ (comes with Node.js)
- **Git**

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Technikhighknee/agent-workbench.git
cd agent-workbench
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all packages in the monorepo.

### 3. Build All Packages

```bash
npm run build
```

Or build a specific package:

```bash
npm run build:syntax    # Build syntax package
npm run build:history   # Build history package
# etc.
```

### 4. Run Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

## Project Structure

```
agent-workbench/
├── packages/
│   ├── core/        # Shared utilities (Result type, MCP helpers)
│   ├── syntax/      # Code parsing and symbol operations
│   ├── history/     # Git operations
│   ├── project/     # Project info and structure
│   ├── types/       # TypeScript type checking
│   ├── test-runner/ # Test execution
│   ├── task-runner/ # Background task management
│   ├── insight/     # Code analysis
│   ├── preview/     # Edit impact prediction
│   └── board/       # Task tracking board
├── .claude/
│   └── skills/      # AI agent skill documentation
└── package.json     # Root workspace config
```

## Development Workflow

### Creating a Feature Branch

```bash
git checkout -b feat/your-feature-name
```

### Making Changes

1. Make your changes in the relevant package(s)
2. Build to check for TypeScript errors: `npm run build`
3. Run tests: `npm test`
4. Commit your changes (see commit conventions below)

### Package Dependencies

The packages have dependencies on each other. Build order matters:

1. `core` - No dependencies, build first
2. `syntax`, `history`, `project`, `types`, `task-runner` - Depend on `core`
3. `test-runner` - Depends on `task-runner`
4. `insight`, `preview` - Depend on `syntax`, `types`
5. `board` - Depends on `core`

When in doubt, run `npm run build` to build everything in the correct order.

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use the `Result` type from `@agent-workbench/core` for error handling
- Export types separately: `export type { MyType }`

### File Organization

Each package follows a similar structure:

```
src/
├── core/           # Domain logic, models, services
├── tools/          # MCP tool implementations
├── infrastructure/ # External adapters (optional)
└── server.ts       # MCP server entry point
```

### Naming Conventions

- **Files**: `camelCase.ts` for modules, `PascalCase.ts` for classes
- **Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE` or `camelCase`

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Scope

The scope is typically the package name:

- `feat(syntax): add symbol search`
- `fix(history): handle merge commits`
- `docs(board): add README`

### Examples

```bash
# Feature
git commit -m "feat(syntax): add find_unused_exports tool"

# Bug fix
git commit -m "fix(history): correct blame line numbers"

# Documentation
git commit -m "docs: add CONTRIBUTING guide"

# Refactor
git commit -m "refactor(core): extract Result utilities"
```

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** with clear, focused commits
3. **Ensure tests pass**: `npm test`
4. **Ensure build succeeds**: `npm run build`
5. **Push your branch** and create a PR
6. **Fill out the PR template** with:
   - Summary of changes
   - Test plan
7. **Address review feedback**
8. **Squash and merge** when approved

### PR Title Format

Use the same format as commit messages:

```
feat(syntax): add symbol renaming tool
```

## Adding a New Tool

To add a new MCP tool to an existing package:

1. Create the tool file in `src/tools/yourTool.ts`
2. Implement using the `server.registerTool()` pattern
3. Register in `src/tools/index.ts`
4. Add tests in `test/yourTool.test.ts`
5. Update the package README with tool documentation
6. Update the skill file in `.claude/skills/<package>/SKILL.md`

## Adding a New Package

1. Create directory: `packages/your-package/`
2. Copy structure from an existing package
3. Add to `workspaces` in root `package.json`
4. Add build script: `"build:your-package": "npm run build -w @agent-workbench/your-package"`
5. Create skill file: `.claude/skills/your-package/SKILL.md`
6. Update root README with package description

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones

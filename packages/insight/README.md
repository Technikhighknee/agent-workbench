# @agent-workbench/insight

Comprehensive code understanding for AI agents. One call to understand files, directories, or symbols.

## Why This Package?

AI agents need to understand code quickly without multiple tool calls:
- **What does this file do?** → Structure, relationships, recent changes
- **What's in this module?** → Key symbols, dependencies, entry points
- **How is this function used?** → Callers, callees, related code
- **What should I refactor?** → Automated code quality analysis

## Tools

| Tool | Description |
|------|-------------|
| `insight` | Get comprehensive understanding of a file, directory, or symbol |
| `suggest_refactoring` | Analyze code and suggest refactoring opportunities |

## Installation

```bash
npm install @agent-workbench/insight
```

## MCP Configuration

```json
{
  "mcpServers": {
    "insight": {
      "command": "npx",
      "args": ["@agent-workbench/insight"]
    }
  }
}
```

## Usage Examples

### Understanding a File
```
insight { "target": "src/server.ts" }
```
Returns:
- Summary (what this file does)
- Structure (symbols, imports, exports)
- Relationships (who imports this, what it imports)
- Recent changes (git history)
- Metrics (lines, complexity)

### Understanding a Directory
```
insight { "target": "src/utils" }
```
Returns:
- Files and subdirectories
- Entry points
- Key exported symbols
- Dependencies (external and internal)
- Aggregate metrics

### Understanding a Symbol
```
insight { "target": "TaskRunner" }
```
Returns:
- Symbol location and kind
- Signature and code
- Call relationships (calls, called by)
- Related symbols
- Recent changes

### Suggest Refactoring
```
suggest_refactoring { "target": "src/server.ts" }
```
Analyzes code and suggests improvements:
- Extract long functions
- Split large files
- Reduce coupling
- Remove unused code

### Focus Analysis
```
suggest_refactoring {
  "target": "src/api/",
  "focus": "coupling"
}
```
Focus options: `all`, `complexity`, `coupling`, `unused`, `tests`, `naming`

## Architecture

```
src/
├── InsightService.ts    # Core insight logic
├── model.ts             # Types (Insight, FileInsight, etc.)
├── tools/
│   ├── insight.ts       # insight tool
│   ├── suggestRefactoring.ts  # refactoring analyzer
│   └── index.ts         # Tool registration
├── server.ts            # MCP server entry point
└── index.ts             # Library exports
```

## Detection Capabilities

### Refactoring Suggestions
- **Long functions** (>50 lines) → Extract smaller functions
- **Large files** (>500 lines) → Split into modules
- **High coupling** (>15 imports) → Reduce dependencies
- **Unused code** → Remove dead exports
- **Complex symbols** (many callees) → Simplify
- **Poor naming** → Rename suggestions

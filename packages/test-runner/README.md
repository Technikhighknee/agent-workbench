# @agent-workbench/test-runner

Test execution with structured results for AI agents. Run tests, get failures with source locations, iterate quickly.

## Why This Package?

AI agents need to verify code changes work correctly:
- **Did my fix work?** → `run_tests` shows pass/fail with details
- **What exactly failed?** → `get_test_failures` shows expected vs actual
- **Where's the bug?** → Stack traces mapped to source locations
- **Fast iteration** → `rerun_failed` only runs what failed

## Tools

| Tool | Description |
|------|-------------|
| `run_tests` | Run tests and get structured results |
| `get_test_failures` | Get detailed failure info with source locations |
| `list_test_files` | Discover test files in the project |
| `rerun_failed` | Re-run only tests that failed |
| `find_tests_for` | Find test files related to a source file (by naming convention & imports) |
| `run_related_tests` | Run tests for a specific source file automatically |

## Installation

```bash
npm install @agent-workbench/test-runner
```

## MCP Configuration

```json
{
  "mcpServers": {
    "test-runner": {
      "command": "npx",
      "args": ["@agent-workbench/test-runner"]
    }
  }
}
```

## Usage Examples

### Running All Tests
```
run_tests {}
```
Returns structured results with pass count, fail count, and duration.

### Running Specific Files
```
run_tests { "files": ["src/utils.test.ts"] }
```

### Filtering by Test Name
```
run_tests { "testNamePattern": "should handle errors" }
```

### Getting Failure Details
```
get_test_failures {}
```
Returns detailed info for each failure:
- Test name and file location
- Expected vs actual values
- Stack trace with source mapping

### Fast Iteration
```
rerun_failed {}
```
Only runs the tests that failed - much faster for fixing issues.

## Supported Frameworks

- **Jest** - Auto-detected via jest.config.* or package.json
- **Vitest** - Auto-detected via vitest.config.*
- **Node Test Runner** - Auto-detected via package.json test script

## Architecture

```
src/
├── core/
│   ├── model.ts              # Domain types (TestRun, TestResult, etc.)
│   └── ports/                # Adapter interfaces
├── infrastructure/
│   ├── adapters/             # Framework-specific adapters
│   │   ├── JestAdapter.ts
│   │   ├── VitestAdapter.ts
│   │   └── NpmTestAdapter.ts
│   └── TestRunnerServiceImpl.ts
├── tools/                    # MCP tool implementations
└── server.ts                 # MCP server entry point
```

Follows hexagonal architecture - core domain is framework-agnostic, adapters handle specifics.

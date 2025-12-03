# test-runner

[← Back to packages](README.md) · [Source](../../packages/test-runner/)

MCP server for running tests with structured results. Framework-agnostic, maps failures to source locations.

## Tools

| Tool | Description |
|------|-------------|
| `find_tests_for` | Find test files related to a source file. |
| `get_test_failures` | Get detailed information about failed tests from the last run. |
| `list_test_files` | List all test files in the project. |
| `rerun_failed` | Rerun only the tests that failed in the last run. |
| `run_related_tests` | Run tests related to a source file. |
| `run_tests` | Run tests in the project and get structured results. |

## MCP Configuration

```json
{
  "test-runner": {
    "command": "npx",
    "args": ["@agent-workbench/test-runner"]
  }
}
```

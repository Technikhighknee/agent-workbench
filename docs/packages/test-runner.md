# test-runner

[← Back to packages](README.md) · [Source](../../packages/test-runner/)

Structured test results. No output parsing needed.

## Tools

- `run_tests`
- `get_test_failures`
- `rerun_failed`
- `find_tests_for`
- `run_related_tests`
- `list_test_files`

## MCP Configuration

```json
{
  "test-runner": {
    "command": "npx",
    "args": ["@agent-workbench/test-runner"]
  }
}
```

See [GUIDE.md](../../packages/test-runner/GUIDE.md) for full documentation.
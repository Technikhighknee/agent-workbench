# task-runner

[← Back to packages](README.md) · [Source](../../packages/task-runner/)

Run long commands without timeouts. SQLite persistence survives restarts.

## Tools

- `task_run`
- `task_start`
- `task_get`
- `task_kill`
- `task_list`

## MCP Configuration

```json
{
  "task-runner": {
    "command": "npx",
    "args": ["@agent-workbench/task-runner"]
  }
}
```

See [GUIDE.md](../../packages/task-runner/GUIDE.md) for full documentation.
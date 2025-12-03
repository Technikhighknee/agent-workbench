# task-runner

[← Back to packages](README.md) · [Source](../../packages/task-runner/)

Robust task execution for AI agents with detached processes and JSON persistence

## Tools

| Tool | Description |
|------|-------------|
| `task_get` | Get a task |
| `task_kill` | Stop a running task. |
| `task_list` | List all tasks, showing status and duration. |
| `task_run` | Run a command and wait for it to complete (or timeout). |
| `task_start` | Start a command in the background and return immediately. |

## MCP Configuration

```json
{
  "task-runner": {
    "command": "npx",
    "args": ["@agent-workbench/task-runner"]
  }
}
```

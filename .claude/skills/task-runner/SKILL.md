---
name: task-runner
description: "Builds that don't die after 2 minutes. Tasks survive restarts."
allowed-tools: mcp__task-runner__task_run, mcp__task-runner__task_start, mcp__task-runner__task_get, mcp__task-runner__task_kill, mcp__task-runner__task_list
---

# task-runner

**No 2-minute timeout. Clean output. Tasks persist across server restarts.**

## First: task_run

For any build or long command:
```
task_run({ command: 'npm run build' })
```

## Why This Wins

| The Problem | Built-in Failure | task-runner Solution |
|-------------|------------------|----------------------|
| Long builds | Bash times out after 2 min | `task_run` waits as long as needed |
| Background tasks | Lost when session ends | SQLite persistence across restarts |
| Dev servers | Polling with sleep | `task_start` with `wait_for` pattern |
| Kill process | Find PID manually | `task_kill({ id })` |

## Quick Reference

| Task | Tool |
|------|------|
| Run and wait | `task_run` |
| Start background | `task_start` |
| Check status | `task_get` |
| List all tasks | `task_list` |
| Stop a task | `task_kill` |

## How task_run Works

Waits up to 30 seconds (configurable). If still running:
- Returns control to you with task ID
- Task continues in background
- Use `task_get` to check, `task_kill` to stop

**You're never stuck.**

## Common Workflows

### Build Project
```
task_run({ command: 'npm run build', label: 'Build' })
```

### Start Dev Server
```
task_start({
  command: 'npm run dev',
  wait_for: 'listening on port',
  wait_timeout: 30000
})
```

### Monitor & Stop
```
task_list({ running: true })
task_get({ id: '<id>' })
task_kill({ id: '<id>' })
```

## Task States

- **running** - Executing
- **done** - Exit 0
- **failed** - Exit != 0
- **killed** - Stopped by you
- **orphaned** - From previous session

## Task Hygiene

1. Stop dev servers when done
2. Check `task_list` for orphans
3. Use labels for identification

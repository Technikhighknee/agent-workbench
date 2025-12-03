---
name: task-runner
tagline: "Builds that don't die. Tasks survive restarts."
---

# task-runner

**Run long commands without timeouts.** SQLite persistence survives restarts.

## Start Here

```
task_run({ command: 'npm run build' })
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Long builds | Bash times out at 2min | `task_run` waits 10min |
| Dev servers | Process lost on restart | `task_start` persists |
| Output parsing | ANSI codes everywhere | Auto-cleaned output |

## Quick Reference

| Task | Tool |
|------|------|
| Run and wait | `task_run` |
| Start background | `task_start` |
| Check status | `task_get` |
| Stop task | `task_kill` |
| List all tasks | `task_list` |

## Workflows

### Run Build
```
task_run({ command: 'npm run build', timeout: 60000 })
```

### Start Dev Server
```
task_start({
  command: 'npm run dev',
  wait_for: 'ready|listening',
  label: 'dev-server'
})
```

### Check Running Tasks
```
task_list({ running: true })
task_get({ id: 'abc123' })
```

### Stop a Task
```
task_kill({ id: 'abc123' })
task_kill({ id: 'abc123', force: true })  // SIGKILL
```

## Features

- SQLite persistence - tasks survive server restarts
- Output cleaning - ANSI stripped, progress bars removed
- Orphan detection - marks tasks from crashed servers

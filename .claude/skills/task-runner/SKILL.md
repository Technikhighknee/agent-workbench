---
name: task-runner
description: "MANDATORY: Use INSTEAD of Bash for builds/tests. No timeouts, clean output. NEVER use Bash for npm run/test."
allowed-tools: mcp__task-runner__task_run, mcp__task-runner__task_start, mcp__task-runner__task_get, mcp__task-runner__task_kill, mcp__task-runner__task_list
---

# task-runner

**Task execution with persistence.** No timeouts. Clean output. Tasks survive server restarts.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Run build | `Bash: npm run build` | `task_run({ command: 'npm run build' })` |
| Start dev server | `Bash: npm run dev &` | `task_start({ command: 'npm run dev' })` |
| Run tests | `Bash: npm test` | `task_run({ command: 'npm test' })` |
| Check server ready | Poll with sleep | `task_start({ wait_for: 'listening' })` |
| Kill background task | `Bash: kill PID` | `task_kill({ id })` |

## WHY MANDATORY

1. **No 2-minute timeout** - Builds can take as long as needed
2. **Clean output** - ANSI codes stripped, progress bars removed
3. **Persistent** - Tasks survive server restarts (SQLite storage)
4. **Simple API** - Only 5 tools instead of 14
5. **You stay in control** - `task_run` returns after 30s if still running

## HOW `task_run` WORKS

`task_run` waits up to 30 seconds (default). If the task is still running:
- Returns control to you with the task ID
- Task continues in background
- Use `task_get` to check status, `task_kill` to stop

**You're never stuck.** Use `task_kill({ id })` to cancel like Ctrl+C.

## NEGATIVE RULES

- **NEVER** `Bash` for `npm run build` - use `task_run`
- **NEVER** `Bash` with `&` for background - use `task_start`
- **NEVER** `sleep && curl` to wait - use `task_start` with `wait_for`
- **NEVER** lose track of background tasks - use `task_list`

## TOOL REFERENCE

| Tool | Purpose |
|------|---------|
| `task_run` | Run command, wait for completion |
| `task_start` | Start background task, optionally wait for pattern |
| `task_get` | Get task status and output |
| `task_kill` | Stop a running task |
| `task_list` | See all tasks |

## COMMON WORKFLOWS

### Build Project
```
task_run({
  command: 'npm run build',
  label: 'Build'
})
// Blocks until done, returns exit code
```

### Start Dev Server
```
task_start({
  command: 'npm run dev',
  label: 'Dev Server',
  wait_for: 'listening on port',
  wait_timeout: 30000
})
// Waits until server is ready, then returns
```

### Monitor Background Task
```
task_list({ running: true })
// See what's running

task_get({ id: '<task-id>' })
// Get status and output
```

### Stop a Task
```
task_kill({ id: '<task-id>' })
// Graceful termination (SIGTERM)

task_kill({ id: '<task-id>', force: true })
// Force kill (SIGKILL)
```

## TASK STATES

- **running** - Task is executing
- **done** - Completed successfully (exit 0)
- **failed** - Completed with error (exit != 0)
- **killed** - Stopped by user
- **orphaned** - Was running when server restarted

**Tasks persist** - You can see tasks from previous sessions with `task_list`.

## TASK HYGIENE

1. **Stop servers when done** - Don't leave dev servers running
2. **Check for orphans** - `task_list` shows orphaned tasks from previous runs
3. **Use labels** - Make tasks identifiable

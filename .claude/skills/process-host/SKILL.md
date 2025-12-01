---
name: process-host
description: Use for all spawned processes like dev servers, watchers, and builds. Replaces Bash.run_in_background and most process calls that stay active and need to be killed.
allowed-tools: mcp__process-host__start_process, mcp__process-host__get_logs, mcp__process-host__stop_process, mcp__process-host__wait_for_pattern, mcp__process-host__list_processes, mcp__process-host__restart_process, mcp__process-host__get_process, mcp__process-host__purge_processes, mcp__process-host__stop_all_processes, mcp__process-host__send_signal, mcp__process-host__search_logs, mcp__process-host__get_stats, mcp__process-host__write_stdin
---

# process-host

Manages long-running processes with persistent tracking, log capture, and lifecycle control.

## When to Use

- Commands that don't terminate on their own after running
- Dev servers (`npm run dev`, `python -m http.server`)
- Build watchers (`tsc --watch`, `npm run build:watch`)
- Any background process you need to monitor
- Interactive processes that need stdin input

## Tools

### Lifecycle

| Tool | Description |
|------|-------------|
| `start_process` | Start a command in a managed session |
| `stop_process` | Terminate gracefully (SIGTERM) |
| `restart_process` | Stop and restart with same config |
| `stop_all_processes` | Stop all running processes |
| `send_signal` | Send specific signal (SIGTERM, SIGKILL, SIGINT, SIGHUP) |

### Monitoring

| Tool | Description |
|------|-------------|
| `get_logs` | Read recent process output |
| `search_logs` | Search logs for pattern (regex) |
| `wait_for_pattern` | Block until output matches pattern |
| `get_process` | Get details about a specific process |
| `list_processes` | List all or running-only processes |
| `get_stats` | Get summary statistics |

### Other

| Tool | Description |
|------|-------------|
| `write_stdin` | Send input to a running process |
| `purge_processes` | Clean up old process records |

## Decision Tree

### Starting a Process
- Long-running server → `start_process` + `wait_for_pattern`
- Quick command → built-in `Bash`
- Need stdin interaction → `start_process` + `write_stdin`

### Monitoring
- Check if ready → `wait_for_pattern({ pattern: "listening|ready|started" })`
- Find errors → `search_logs({ pattern: "error|exception" })`
- See recent output → `get_logs({ last_lines: 50 })`

### Cleanup
- Stop one process → `stop_process`
- Stop everything → `stop_all_processes`
- Force kill stuck process → `send_signal({ signal: "SIGKILL" })`

## Workflows

### Dev Server
```
1. start_process({ command: 'npm run dev', label: 'dev-server' })
2. wait_for_pattern({ id, pattern: 'listening on port' })
3. ... do work ...
4. stop_process({ id })
```

### Interactive Process
```
1. start_process({ command: 'node', label: 'repl' })
2. write_stdin({ id, data: 'console.log("hello")\n' })
3. get_logs({ id })
4. stop_process({ id })
```

### Build and Watch
```
1. start_process({ command: 'npm run build:watch', label: 'build' })
2. wait_for_pattern({ id, pattern: 'compiled|watching' })
3. ... make changes, check get_logs periodically ...
4. stop_process({ id })
```

## Notes

- Built-in Bash timeout is 2 minutes; process-host has no limit
- Processes persist across tool calls
- Use labels for easy identification: `{ label: 'api-server' }`
- Replaces `Bash.run_in_background`
- SQLite persistence survives restarts
- Check `list_processes({ running_only: true })` to see what's active

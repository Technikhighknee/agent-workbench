---
name: process-host
description: Use for all spawned processes like dev servers, watchers, and builds. Replaces Bash.run_in_background and most process calls that stay active and need to be killed.
allowed-tools: mcp__process-host__run_process, mcp__process-host__spawn_process, mcp__process-host__get_logs, mcp__process-host__stop_process, mcp__process-host__wait_for_pattern, mcp__process-host__list_processes, mcp__process-host__restart_process, mcp__process-host__get_process, mcp__process-host__purge_processes, mcp__process-host__stop_all_processes, mcp__process-host__send_signal, mcp__process-host__search_logs, mcp__process-host__get_stats, mcp__process-host__write_stdin
---

# process-host

Manages processes with persistent tracking, log capture, and lifecycle control.

## When to Use

**Use `run_process` instead of Bash for:**
- Build commands (`npm run build`, `cargo build`, `make`)
- Test runs (`npm test`, `pytest`, `go test`)
- Any command that might take a while
- When you want cleaner, compacted output

**Use `spawn_process` for:**
- Dev servers (`npm run dev`, `python -m http.server`)
- Build watchers (`tsc --watch`, `npm run build:watch`)
- Any background process you need to monitor

## Tools

### Running Commands

| Tool | Description |
|------|-------------|
| `run_process` | Run command, wait for completion, return compacted output |
| `spawn_process` | Start background process, return immediately |

### Lifecycle

| Tool | Description |
|------|-------------|
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

### Which tool?
- Command completes on its own → `run_process`
- Command runs indefinitely → `spawn_process`
- Need stdin interaction → `spawn_process` + `write_stdin`

### vs Bash
- No timeout needed → `run_process`
- Want clean output (no ANSI) → `run_process`
- Need to check logs later → `run_process` or `spawn_process`
- Quick one-liner → Bash is fine

## Workflows

### Build Project
```
run_process({ command: 'npm run build' })
// Returns: [✓] npm:build + compacted output
```

### Run Tests
```
run_process({ command: 'npm test' })
// Returns: [✓] npm:test or [✗ exit 1] npm:test + error output
```

### Dev Server
```
1. spawn_process({ command: 'npm run dev', label: 'dev-server' })
2. wait_for_pattern({ id, pattern: 'listening on port' })
3. ... do work ...
4. stop_process({ id })
```

### Interactive Process
```
1. spawn_process({ command: 'node', label: 'repl' })
2. write_stdin({ id, data: 'console.log("hello")\n' })
3. get_logs({ id })
4. stop_process({ id })
```

## Notes

- `run_process` has no timeout - waits indefinitely
- Output is cleaned: ANSI stripped, progress removed, long output compacted
- Processes persist in history for debugging
- Use labels for easy identification: `{ label: 'api-server' }`
- Check `list_processes({ running_only: true })` to see what's active

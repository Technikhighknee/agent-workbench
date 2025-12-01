---
name: process-host
description: Run builds and tests without timeouts. Start dev servers properly. Clean output, full lifecycle control.
allowed-tools: mcp__process-host__run_process, mcp__process-host__spawn_process, mcp__process-host__get_logs, mcp__process-host__stop_process, mcp__process-host__wait_for_pattern, mcp__process-host__list_processes, mcp__process-host__restart_process, mcp__process-host__get_process, mcp__process-host__purge_processes, mcp__process-host__stop_all_processes, mcp__process-host__send_signal, mcp__process-host__search_logs, mcp__process-host__get_stats, mcp__process-host__write_stdin
---

# process-host

**No timeouts. Clean output.** Builds wait as long as needed. Dev servers start properly.

## Tools

| Tool | Purpose |
|------|---------|
| `run_process` | Run command, wait indefinitely |
| `spawn_process` | Start background process |
| `wait_for_pattern` | Block until "ready" appears |
| `get_logs` / `search_logs` | Check output |
| `stop_process` / `restart_process` | Lifecycle |
| `list_processes` | See what's running |
| `write_stdin` | Send input |

## Quick Examples

```
run_process({ command: 'npm run build' })
run_process({ command: 'npm test' })

spawn_process({ command: 'npm run dev', label: 'dev' })
wait_for_pattern({ id, pattern: 'listening|ready' })
stop_process({ id })
```

**Output is cleaned:** ANSI stripped, progress bars removed, long output compacted.

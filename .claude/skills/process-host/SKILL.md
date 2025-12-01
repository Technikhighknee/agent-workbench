---
name: process-host
description: Use for all spawned proccesses like dev servers, watchers, and builds. Replaces Bash.run_in_background and most process calls that stay active and need to be killed.
allowed-tools: mcp__process-host__start_process, mcp__process-host__get_logs, mcp__process-host__stop_process, mcp__process-host__wait_for_pattern, mcp__process-host__list_processes, mcp__process-host__restart_process, mcp__process-host__get_process, mcp__process-host__purge_processes, mcp__process-host__stop_all_processes, mcp__process-host__send_signal, mcp__process-host__search_logs, mcp__process-host__get_stats
---

# process-host

Manages long-running processes with persistent tracking, log capture, and lifecycle control.

## When to Use

- Commands that dont terminate on its own after running
- Dev servers (`npm run dev`, `python -m http.server`)
- Build watchers (`tsc --watch`, `npm run build:watch`)
- Any background process you need to monitor or is annoying to forget about (for the machine)

## Tools

| Tool | Description |
|------|-------------|
| `start_process` | Start a command in a session |
| `get_logs` | Read process output (stdout/stderr) |
| `stop_process` | Terminate gracefully |
| `wait_for_pattern` | Block until output matches pattern |
| `list_processes` | Show all tracked processes |
| `restart_process` | Restart with same config |

## Workflows

### Dev Server
```
1. start_process({ command: 'npm run dev', label: 'dev-server' })
2. wait_for_pattern({ id, pattern: 'listening on port' })
3. ... do work ...
4. stop_process({ id })
```

### Build and Watch
```
1. start_process({ command: 'npm run build:watch' })
2. get_logs({ id }) periodically
3. stop_process({ id }) when done
```

## Notes

- Built-in Bash timeout is 2 minutes; process-host has no limit
- Processes persist across tool calls
- Use labels for identification: `{ label: 'api-server' }`
- Replaces `Bash.run_in_background`

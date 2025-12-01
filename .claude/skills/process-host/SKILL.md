---
name: process-host
description: Run builds and tests without timeouts. Start dev servers properly. Clean output, full lifecycle control. (project)
allowed-tools: mcp__process-host__run_process, mcp__process-host__spawn_process, mcp__process-host__get_logs, mcp__process-host__stop_process, mcp__process-host__wait_for_pattern, mcp__process-host__list_processes, mcp__process-host__restart_process, mcp__process-host__get_process, mcp__process-host__purge_processes, mcp__process-host__stop_all_processes, mcp__process-host__send_signal, mcp__process-host__search_logs, mcp__process-host__get_stats, mcp__process-host__write_stdin
---

# process-host

**No timeouts. Clean output.** Builds wait as long as needed. Dev servers start properly.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Run a build | `Bash: npm run build` | `run_process({ command: 'npm run build' })` |
| Run tests (long) | `Bash: npm test` | `run_process({ command: 'npm test' })` |
| Start dev server | `Bash` with background | `spawn_process({ command: 'npm run dev' })` |
| Wait for server ready | `Bash: sleep` or polling | `wait_for_pattern({ id, pattern: 'listening\|ready' })` |
| Check process output | `BashOutput` | `get_logs({ id })` |
| Search logs for errors | Manual scanning | `search_logs({ id, pattern: 'error' })` |
| Stop a process | `KillShell` | `stop_process({ id })` |
| Restart crashed process | Manual stop + start | `restart_process({ id })` |
| See running processes | Manual tracking | `list_processes({ running_only: true })` |
| Send input to process | Not possible with Bash | `write_stdin({ id, data: 'yes\n' })` |

## WHY MANDATORY

- `Bash` has **2-MINUTE TIMEOUT** - builds and tests often exceed this
- `run_process` waits **INDEFINITELY** (up to 10 min default, configurable)
- `Bash` output has **ANSI CODES** and progress bars - process-host **STRIPS** them
- `spawn_process` + `wait_for_pattern` ensures server is **ACTUALLY READY**
- `search_logs` finds errors **WITHOUT** reading entire output

## NEGATIVE RULES

- **NEVER** use `Bash` for builds - use `run_process`
- **NEVER** use `Bash` for test suites - use `run_process`
- **NEVER** use `Bash` with `&` for background - use `spawn_process`
- **NEVER** use `sleep` to wait for servers - use `wait_for_pattern`
- **NEVER** use `KillShell` - use `stop_process`

## MANDATORY WORKFLOW: Dev Server

```
1. spawn_process({ command: 'npm run dev', label: 'dev-server' })
2. wait_for_pattern({ id, pattern: 'listening|ready|started' })
3. ... do work ...
4. stop_process({ id })
```

## MANDATORY WORKFLOW: Build + Test

```
1. run_process({ command: 'npm run build', label: 'build' })
2. run_process({ command: 'npm test', label: 'test' })
```

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

list_processes({ running_only: true })
search_logs({ id, pattern: 'error|fail' })
```

**Output is cleaned:** ANSI stripped, progress bars removed, long output compacted.

---
name: process-host
description: "MANDATORY: Use INSTEAD of Bash for builds/tests. No timeouts, clean output. NEVER use Bash for npm run/test."
allowed-tools: mcp__process-host__run_process, mcp__process-host__spawn_process, mcp__process-host__get_logs, mcp__process-host__stop_process, mcp__process-host__list_processes, mcp__process-host__get_process, mcp__process-host__restart_process, mcp__process-host__wait_for_pattern, mcp__process-host__search_logs
---

# process-host

**Long-running process management.** No timeouts. Clean output. Background processes.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Run build | `Bash: npm run build` | `run_process({ command: 'npm run build' })` |
| Start dev server | `Bash: npm run dev &` | `spawn_process({ command: 'npm run dev' })` |
| Run tests | `Bash: npm test` | `run_process({ command: 'npm test' })` |
| Check server ready | Poll with sleep | `wait_for_pattern({ pattern: 'listening' })` |
| Kill background process | `Bash: kill PID` | `stop_process({ id })` |

## WHY MANDATORY

1. **No 2-minute timeout** - Builds can take as long as needed
2. **Clean output** - ANSI codes stripped, progress bars removed
3. **Background processes** - Persist across tool calls
4. **Structured management** - List, stop, restart by ID

## NEGATIVE RULES

- **NEVER** `Bash` for `npm run build` - use `run_process`
- **NEVER** `Bash` with `&` for background - use `spawn_process`
- **NEVER** `sleep && curl` to wait - use `wait_for_pattern`
- **NEVER** lose track of background processes - use `list_processes`

## TOOL REFERENCE

### Foreground (blocks until done)
| Tool | Purpose |
|------|---------|
| `run_process` | Run command, wait for completion |

### Background (returns immediately)
| Tool | Purpose |
|------|---------|
| `spawn_process` | Start background process |
| `get_logs` | Read process output |
| `stop_process` | Terminate process |
| `restart_process` | Stop and start again |
| `wait_for_pattern` | Block until output matches |
| `search_logs` | Find patterns in output |
| `list_processes` | See all processes |
| `get_process` | Get process details |

## COMMON WORKFLOWS

### Build Project
```
run_process({ 
  command: 'npm run build',
  label: 'Build' 
})
// Blocks until done, returns exit code
```

### Start Dev Server
```
spawn_process({ 
  command: 'npm run dev',
  label: 'Dev Server'
})
// Returns process ID immediately

wait_for_pattern({ 
  id: '<process-id>',
  pattern: 'listening on port'
})
// Block until server is ready
```

### Monitor Background Process
```
list_processes({ running_only: true })
// See what's running

get_logs({ id: '<process-id>', last_lines: 50 })
// Read recent output

search_logs({ id: '<process-id>', pattern: 'error' })
// Find errors in output
```

### Restart Crashed Server
```
restart_process({ id: '<process-id>' })
// Stop and start with same config
```

### Clean Shutdown
```
stop_process({ id: '<process-id>' })
// Graceful termination

stop_all_processes({})
// Stop everything
```

**Process IDs persist** - Can reference processes later in session.

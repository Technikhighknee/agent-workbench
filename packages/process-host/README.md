# Process-Host
> AI-Agents shall never lose track of running processes again.

Back to [main README.md](../../)

## Tools

### Running Commands

| Tool | Description |
|------|-------------|
| `run_process` | Run command, wait for completion, return compacted output. No timeout. |
| `spawn_process` | Start background process, return immediately with ID |

### Lifecycle

| Tool | Description |
|------|-------------|
| `stop_process` | Terminate a running process (SIGTERM by default) |
| `restart_process` | Restart a process with the same configuration |
| `stop_all_processes` | Stop all running processes at once |
| `send_signal` | Send a specific signal (SIGTERM, SIGINT, SIGKILL, SIGHUP) |

### Monitoring

| Tool | Description |
|------|-------------|
| `get_logs` | Get recent output from a process |
| `search_logs` | Search logs for patterns using regex |
| `wait_for_pattern` | Block until output matches pattern |
| `get_process` | Get full details about a specific process |
| `list_processes` | List all or running-only processes |
| `get_stats` | Get summary statistics |

### Other

| Tool | Description |
|------|-------------|
| `write_stdin` | Send input to a running process's stdin |
| `purge_processes` | Clean up old process records and logs |

## Features

- **run_process** - Waits for completion, strips ANSI, shows execution time
- **Persistent tracking** - SQLite-backed storage survives across sessions
- **Smart labels** - Auto-generated from commands (e.g., `npm run dev` → `npm:dev`)
- **Process lifecycle** - Tracks: `starting`, `running`, `exited`, `failed`, `stopped`, `timeout`
- **Interactive support** - Write to stdin for prompts and REPLs
- **Auto-timeout** - Optional auto-kill after specified duration
- **Log search** - Find patterns in output with regex
- **Wait for ready** - Block until output matches pattern

## Usage

### run_process (for commands that complete)

```typescript
// Build project
run_process({ command: 'npm run build' });
// Returns: [✓] npm:build (3.2s)

// Run tests
run_process({ command: 'npm test' });
// Returns: [✓] npm:test (5.1s) + output
```

### spawn_process (for background processes)

```typescript
// Start dev server
const { id } = spawn_process({ command: 'npm run dev', label: 'dev-server' });

// Wait for ready
wait_for_pattern({ id, pattern: 'listening on port' });

// Later: stop it
stop_process({ id });
```

### Interactive processes

```typescript
// Start REPL
const { id } = spawn_process({ command: 'node' });

// Send input
write_stdin({ id, data: 'console.log("hello")\n' });

// Check output
get_logs({ id });
```

## vs Bash

| Feature | run_process | Bash |
|---------|------------|------|
| Timeout | No limit | 2 minutes |
| Output | Cleaned (no ANSI) | Raw |
| History | Persisted | Lost |
| Timing | Shown | Hidden |

## Architecture

```
packages/process-host/
├── src/
│   ├── core/
│   │   ├── model.ts              # ProcessInfo, LogEntry
│   │   ├── result.ts             # Result<T, E> type
│   │   ├── ports/                # Repository, Spawner interfaces
│   │   └── services/
│   │       └── ProcessService.ts # Main orchestrator
│   │
│   ├── infrastructure/
│   │   ├── memory/               # InMemoryProcessRepository, InMemoryLogRepository
│   │   ├── sqlite/               # SQLiteProcessRepository, SQLiteLogRepository
│   │   └── runner/               # NodeProcessSpawner
│   │
│   ├── tools/                    # MCP tool definitions
│   ├── server.ts                 # MCP server entry
│   └── index.ts                  # Library exports
```

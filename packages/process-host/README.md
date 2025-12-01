# Process-Host
> AI-Agents shall never lose track of running `npm run dev` processes again.  

Back to [main README.md](../../)  

## Tools

| Tool | Description |
|------|-------------|
| `start_process` | Start a long-running command. Returns immediately with session ID. Supports working directory, environment variables, labels, and auto-kill timeout. |
| `get_logs` | Get recent output from a process. Returns combined stdout+stderr by default, or filter by stream. Configurable line count (default: 100, max: 500). |
| `stop_process` | Terminate a running process with configurable signal (SIGTERM, SIGINT, SIGKILL, SIGHUP). |
| `write_stdin` | Send input to a running process's stdin. Useful for interactive prompts and REPLs. |
| `list_processes` | List all process sessions (including historical). Filter with `running_only` for active processes. |
| `get_process` | Get full details about a specific process without logs. |
| `restart_process` | Restart a process with the same configuration. Stops if running, starts fresh with new ID. |
| `purge_processes` | Clean up old process records and logs. Optionally keep running processes or filter by age. |
| `stop_all_processes` | Stop all running processes at once. Useful for clean shutdown or environment reset. |
| `send_signal` | Send a specific signal (SIGTERM, SIGINT, SIGKILL, SIGHUP) without stopping tracking. |
| `search_logs` | Search for patterns in process logs using regex. Find errors, events, or debug info. |
| `get_stats` | Get summary statistics: total, running, exited, failed, and stopped process counts. |
| `wait_for_pattern` | Block until a pattern appears in output. Essential for "Server ready" detection. |

## Features
- **Persistent tracking** – SQLite-backed storage survives across tool calls
- **Smart labels** – Auto-generated from commands (e.g., `npm run dev` → `npm:dev`)
- **Process lifecycle** – Tracks status: `starting`, `running`, `exited`, `failed`, `stopped`, `timeout`
- **Flexible output** – Filter logs by stdout/stderr, configurable line limits
- **Interactive support** – Write to stdin for prompts and REPLs
- **Auto-timeout** – Optional auto-kill after specified duration
- **Batch operations** – Stop all processes, purge history, get statistics
- **Log search** – Find patterns in output with regex support
- **Signal control** – Send any signal for config reloads or debugging
- **Wait for ready** – Block until output matches pattern (e.g., "Server listening")

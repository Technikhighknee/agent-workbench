# @agent-workbench/task-runner

Minimal, robust task execution for AI agents. Runs commands with SQLite persistence - tasks survive server restarts.

## Installation

```bash
npm install @agent-workbench/task-runner
```

## MCP Configuration

```json
{
  "mcpServers": {
    "task-runner": {
      "command": "npx",
      "args": ["@agent-workbench/task-runner"]
    }
  }
}
```

## Why task-runner?

**Problem:** Bash commands timeout, processes get orphaned, output is lost.

**Solution:** SQLite-backed task runner that:
- Persists task state across server restarts
- Cleans ANSI codes and progress bars from output
- Gracefully handles long-running processes
- Marks orphaned tasks from crashed servers

## Tools

### task_run
Run a command and wait for completion (or timeout).

```typescript
task_run({
  command: "npm run build",
  timeout: 30000,  // default: 30s, max: 10min
  cwd: "/path/to/project",
  label: "Build project"
})
// Returns immediately if command finishes, or after timeout with timedOut: true
```

### task_start
Start a command in background, optionally wait for a pattern.

```typescript
// Start dev server, wait for "ready" before returning
task_start({
  command: "npm run dev",
  wait_for: "ready|listening",
  wait_timeout: 30000,
  label: "Dev server"
})
// Returns task ID immediately (or after pattern match)
```

### task_get
Check task status and get output.

```typescript
task_get({
  id: "abc123",
  wait_for: "compiled",  // optional: wait for pattern
  wait_timeout: 10000
})
// Returns: { status, output, exitCode, ... }
```

### task_kill
Stop a running task.

```typescript
task_kill({
  id: "abc123",
  force: true  // SIGKILL instead of SIGTERM
})
```

### task_list
List all tasks with status indicators.

```typescript
task_list({ running: true })  // Only show running tasks
// Status: 🔄 running, ✅ done, ❌ failed, 🛑 killed, 👻 orphaned
```

## Output Cleaning

Task output is automatically cleaned:
- ANSI escape codes stripped
- Progress bars removed
- Spinner frames collapsed
- Excessive blank lines reduced

## Persistence

Tasks are stored in SQLite (`tasks.db`):
- Survives server restarts
- Old tasks auto-deleted after 24 hours
- Orphaned tasks marked on startup
- Cleanup runs every 5 minutes

## Architecture

```
task-runner/
├── src/
│   ├── TaskRunner.ts      # Core runner with SQLite
│   ├── cleanOutput.ts     # ANSI/progress bar removal
│   ├── server.ts          # MCP server entry point
│   └── tools/             # MCP tool definitions
│       ├── run.ts         # task_run
│       ├── start.ts       # task_start
│       ├── get.ts         # task_get
│       ├── kill.ts        # task_kill
│       └── list.ts        # task_list
└── test/
    ├── TaskRunner.test.ts
    └── cleanOutput.test.ts
```

## Use Cases

### Build with timeout
```typescript
const result = await task_run({ command: "npm run build", timeout: 60000 });
if (result.timedOut) {
  // Build still running, check later with task_get
}
```

### Dev server with ready check
```typescript
const task = await task_start({
  command: "npm run dev",
  wait_for: "Local:.*http",
  wait_timeout: 30000
});
// Server is ready when this returns
```

### Monitor long build
```typescript
const task = await task_start({ command: "cargo build --release" });
// Check periodically
while (true) {
  const status = await task_get({ id: task.id });
  if (status.status !== "running") break;
  await sleep(5000);
}
```

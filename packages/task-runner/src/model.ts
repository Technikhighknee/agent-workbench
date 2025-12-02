/**
 * Core domain model for task-runner.
 *
 * Design principles:
 * - Detached processes survive MCP server restarts
 * - Output stored in log files, not database
 * - Metadata in JSON, not SQLite
 * - PID + start time for reliable process identification
 */

/**
 * Task execution status.
 *
 * - running: Process is alive (verified via PID)
 * - done: Completed successfully (exit code 0)
 * - failed: Completed with error (exit code !== 0)
 * - killed: Terminated by user request
 * - orphaned: Was running but process died unexpectedly
 */
export type TaskStatus = "running" | "done" | "failed" | "killed" | "orphaned";

/**
 * A task represents a shell command execution.
 * Persisted to tasks.json for recovery across restarts.
 */
export interface Task {
  /** Unique identifier (nanoid) */
  readonly id: string;

  /** The shell command being executed */
  readonly command: string;

  /** Optional human-readable label */
  readonly label: string | null;

  /** Working directory for execution */
  readonly cwd: string | null;

  /** Current status */
  status: TaskStatus;

  /** Process ID (for reconnection after restart) */
  readonly pid: number;

  /** Path to log file containing output */
  readonly logFile: string;

  /** Process exit code (null if still running) */
  exitCode: number | null;

  /** When the task started (ISO string for JSON serialization) */
  readonly startedAt: string;

  /** When the task ended (ISO string, null if running) */
  endedAt: string | null;

  /** True if output was truncated due to size limits */
  truncated: boolean;
}

/**
 * Options for starting a background task (detached).
 */
export interface StartOptions {
  /** Human-readable label for the task */
  label?: string;

  /** Working directory */
  cwd?: string;

  /** Environment variables to set/override */
  env?: Record<string, string>;
}

/**
 * Options for running a command (waits for completion).
 */
export interface RunOptions extends StartOptions {
  /** How long to wait before returning (ms). Default: 30000 */
  timeout?: number;
}

/**
 * Result of running a command.
 */
export interface RunResult {
  /** The task with final state */
  readonly task: Task;

  /** The task's output */
  readonly output: string;

  /** True if we returned due to timeout (task may still be running) */
  readonly timedOut: boolean;
}

/**
 * Options for waiting on a pattern in output.
 */
export interface WaitOptions {
  /** Regex pattern to wait for in output */
  pattern: RegExp;

  /** How long to wait (ms). Default: 30000 */
  timeout?: number;
}

/**
 * Result of waiting for a pattern.
 */
export interface WaitResult {
  /** Whether the pattern was found */
  readonly matched: boolean;

  /** The task's current state */
  readonly task: Task;

  /** Current output content */
  readonly output: string;
}

/**
 * Configuration for TaskRunner.
 */
export interface TaskRunnerConfig {
  /** Directory for storing data (tasks.json, logs/). Default: ".task-runner" */
  dataDir?: string;

  /** Maximum log file size in bytes before truncation. Default: 10MB */
  maxLogSize?: number;

  /** Maximum number of completed tasks to keep. Default: 100 */
  maxTasks?: number;

  /** Auto-cleanup tasks older than this (ms). Default: 7 days */
  maxAge?: number;

  /** Cleanup interval (ms). 0 = manual only. Default: 1 hour */
  cleanupInterval?: number;
}

/** Default configuration values */
export const DEFAULT_CONFIG: Required<TaskRunnerConfig> = {
  dataDir: ".task-runner",
  maxLogSize: 10 * 1024 * 1024, // 10MB
  maxTasks: 100,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  cleanupInterval: 60 * 60 * 1000, // 1 hour
};

/** Default timeout for run operations */
export const DEFAULT_RUN_TIMEOUT = 30_000; // 30 seconds

/** Default timeout for wait operations */
export const DEFAULT_WAIT_TIMEOUT = 30_000; // 30 seconds

/**
 * Result of cleanup operation.
 */
export interface CleanupResult {
  /** Number of tasks deleted */
  deletedTasks: number;

  /** Number of log files deleted */
  deletedLogs: number;

  /** Number of logs truncated */
  truncatedLogs: number;
}

/**
 * Internal state for an active (running) task.
 * Not persisted - reconstructed from Task + live process.
 */
export interface ActiveTask {
  /** The task metadata */
  task: Task;

  /** File descriptor for the log file */
  logFd: number;

  /** Current output size (for truncation tracking) */
  outputSize: number;
}

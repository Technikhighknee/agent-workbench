/**
 * Core domain model for task-runner.
 * Minimal types - one main entity (Task) with clear states.
 */

/**
 * Task execution status.
 *
 * - running: Currently executing, we have the process handle
 * - done: Completed successfully (exit code 0)
 * - failed: Completed with error (exit code !== 0)
 * - killed: Terminated by user request
 * - orphaned: Was running when server restarted, process lost
 */
export type TaskStatus = "running" | "done" | "failed" | "killed" | "orphaned";

/**
 * A task represents a shell command execution.
 */
export interface Task {
  /** Unique identifier */
  readonly id: string;

  /** The shell command that was/is being executed */
  readonly command: string;

  /** Optional human-readable label */
  readonly label: string | null;

  /** Working directory for execution */
  readonly cwd: string | null;

  /** Current status */
  readonly status: TaskStatus;

  /** Process exit code (null if still running or orphaned) */
  readonly exitCode: number | null;

  /** When the task started */
  readonly startedAt: Date;

  /** When the task ended (null if still running) */
  readonly endedAt: Date | null;

  /** Combined stdout+stderr output (cleaned) */
  readonly output: string;

  /** True if output was truncated due to size limits */
  readonly truncated: boolean;
}

/**
 * Options for running a command (waits for completion).
 */
export interface RunOptions {
  /** Human-readable label for the task */
  label?: string;

  /** Working directory */
  cwd?: string;

  /** Environment variables to set/override */
  env?: Record<string, string>;

  /** How long to wait before returning (ms). Default: 30000 */
  timeout?: number;
}

/**
 * Options for spawning a background task.
 */
export interface SpawnOptions {
  /** Human-readable label for the task */
  label?: string;

  /** Working directory */
  cwd?: string;

  /** Environment variables to set/override */
  env?: Record<string, string>;
}

/**
 * Result of running a command.
 */
export interface RunResult {
  /** The task with final state */
  readonly task: Task;

  /** True if we returned due to timeout (task may still be running) */
  readonly timedOut: boolean;
}

/**
 * Options for waiting on a pattern.
 */
export interface WaitOptions {
  /** Regex pattern to wait for in output */
  pattern: RegExp;

  /** How long to wait (ms). Default: 30000 */
  timeout?: number;

  /** How often to check (ms). Default: 100 */
  pollInterval?: number;
}

/**
 * Result of waiting for a pattern.
 */
export interface WaitResult {
  /** Whether the pattern was found */
  readonly matched: boolean;

  /** The task's current state */
  readonly task: Task;
}

/**
 * Internal task state (not persisted, runtime only).
 */
export interface ActiveTask {
  /** The persisted task data */
  task: Task;

  /** The live process handle */
  process: import("node:child_process").ChildProcess;

  /** Pending output chunks not yet flushed to store */
  pendingOutput: string[];

  /** Flush timer handle */
  flushTimer: NodeJS.Timeout | null;
}

/**
 * Configuration for TaskRunner.
 */
export interface TaskRunnerConfig {
  /** Path to SQLite database file. Default: "tasks.db" in cwd */
  dbPath?: string;

  /** Maximum output size per task in bytes. Default: 512KB */
  maxOutputSize?: number;

  /** How often to flush output to DB (ms). Default: 500 */
  flushInterval?: number;

  /** Auto-cleanup tasks older than this (ms). Default: 24 hours */
  cleanupAge?: number;

  /** Maximum number of completed tasks to keep. Default: 100 */
  maxCompletedTasks?: number;
}

/** Default configuration values */
export const DEFAULT_CONFIG: Required<TaskRunnerConfig> = {
  dbPath: "tasks.db",
  maxOutputSize: 512 * 1024, // 512KB
  flushInterval: 500,
  cleanupAge: 24 * 60 * 60 * 1000, // 24 hours
  maxCompletedTasks: 100,
};

/** Default timeout for run operations */
export const DEFAULT_RUN_TIMEOUT = 30_000; // 30 seconds

/** Default timeout for wait operations */
export const DEFAULT_WAIT_TIMEOUT = 30_000; // 30 seconds

/** Default poll interval for wait operations */
export const DEFAULT_POLL_INTERVAL = 100; // 100ms

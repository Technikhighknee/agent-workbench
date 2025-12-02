/**
 * TaskRunner - The core service for executing and managing tasks.
 *
 * Responsibilities:
 * - Spawn processes and track them
 * - Capture and clean output
 * - Persist state to SQLite
 * - Handle graceful shutdown
 * - Auto-cleanup old tasks
 */

import { spawn } from "node:child_process";
import { nanoid } from "nanoid";

import type {
  Task,
  TaskStatus,
  RunOptions,
  SpawnOptions,
  RunResult,
  WaitOptions,
  WaitResult,
  ActiveTask,
  TaskRunnerConfig,
} from "./model.js";
import {
  DEFAULT_CONFIG,
  DEFAULT_RUN_TIMEOUT,
  DEFAULT_WAIT_TIMEOUT,
  DEFAULT_POLL_INTERVAL,
} from "./model.js";
import { TaskStore } from "./TaskStore.js";
import { cleanOutput } from "./cleanOutput.js";

/**
 * Task execution service.
 *
 * @example
 * ```typescript
 * const runner = new TaskRunner({ dbPath: "tasks.db" });
 *
 * // Run and wait
 * const result = await runner.run("npm test", { timeout: 60_000 });
 * console.log(result.task.output);
 *
 * // Background task
 * const task = runner.spawn("npm run dev");
 * await runner.waitFor(task.id, { pattern: /ready|listening/ });
 * ```
 */
export class TaskRunner {
  private store: TaskStore;
  private config: Required<TaskRunnerConfig>;
  private active = new Map<string, ActiveTask>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: TaskRunnerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new TaskStore(this.config.dbPath);

    // Mark any tasks from previous run as orphaned
    const orphaned = this.store.markOrphaned();
    if (orphaned > 0) {
      console.error(`[task-runner] Marked ${orphaned} task(s) as orphaned from previous run`);
    }

    // Start periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Run a command and wait for completion (or timeout).
   *
   * @param command Shell command to execute
   * @param options Run options
   * @returns Result with task and timeout status
   */
  async run(command: string, options: RunOptions = {}): Promise<RunResult> {
    const task = this.spawn(command, options);
    const timeout = options.timeout ?? DEFAULT_RUN_TIMEOUT;

    const timedOut = await this.waitForExit(task.id, timeout);

    // Get fresh task data from store
    const finalTask = this.store.get(task.id)!;

    return { task: finalTask, timedOut };
  }

  /**
   * Spawn a background task.
   *
   * @param command Shell command to execute
   * @param options Spawn options
   * @returns The created task
   */
  spawn(command: string, options: SpawnOptions = {}): Task {
    // Validate command
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      throw new Error("Command cannot be empty");
    }

    const id = nanoid(12);
    const now = new Date();

    const task: Task = {
      id,
      command: trimmedCommand,
      label: options.label ?? null,
      cwd: options.cwd ?? null,
      status: "running",
      exitCode: null,
      startedAt: now,
      endedAt: null,
      output: "",
      truncated: false,
    };

    // Persist immediately
    this.store.save(task);

    // Spawn the process
    const proc = spawn(trimmedCommand, {
      shell: true,
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"], // Don't need stdin
    });

    // Track active task
    const activeTask: ActiveTask = {
      task,
      process: proc,
      pendingOutput: [],
      flushTimer: null,
    };

    this.active.set(id, activeTask);

    // Capture stdout
    proc.stdout?.on("data", (data: Buffer) => {
      this.handleOutput(id, data.toString());
    });

    // Capture stderr
    proc.stderr?.on("data", (data: Buffer) => {
      this.handleOutput(id, data.toString());
    });

    // Handle process exit
    proc.on("exit", (code, signal) => {
      this.handleExit(id, code, signal);
    });

    // Handle spawn errors
    proc.on("error", (err) => {
      this.handleError(id, err);
    });

    return task;
  }

  /**
   * Get a task by ID.
   *
   * @param id Task ID
   * @returns Task or null if not found
   */
  get(id: string): Task | null {
    // Check active tasks first for freshest output
    const active = this.active.get(id);
    if (active) {
      // Flush pending output and return fresh from store
      this.flushOutput(id);
    }

    return this.store.get(id);
  }

  /**
   * List all tasks.
   *
   * @param runningOnly If true, only return running tasks
   * @returns Array of tasks
   */
  list(runningOnly: boolean = false): Task[] {
    // Flush all pending output first
    for (const id of this.active.keys()) {
      this.flushOutput(id);
    }

    return this.store.list(runningOnly);
  }

  /**
   * Kill a running task.
   *
   * @param id Task ID
   * @param signal Signal to send (default: SIGTERM)
   * @returns True if task was killed, false if not found or not running
   */
  kill(id: string, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): boolean {
    const active = this.active.get(id);
    if (!active) {
      return false;
    }

    // Flush any pending output
    this.flushOutput(id);

    // Kill the process
    active.process.kill(signal);

    // Update status
    this.store.updateStatus(id, "killed", null, new Date());

    // Cleanup
    this.cleanupActive(id);

    return true;
  }

  /**
   * Wait for a pattern to appear in task output.
   *
   * @param id Task ID
   * @param options Wait options
   * @returns Result indicating if pattern was matched
   */
  async waitFor(id: string, options: WaitOptions): Promise<WaitResult> {
    const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT;
    const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const task = this.get(id);

      if (!task) {
        return { matched: false, task: this.createNotFoundTask(id) };
      }

      // Check if pattern matches
      if (options.pattern.test(task.output)) {
        return { matched: true, task };
      }

      // If task is no longer running and pattern not found, give up
      if (task.status !== "running") {
        return { matched: false, task };
      }

      // Wait before checking again
      await this.sleep(pollInterval);
    }

    // Timeout - get final state
    const task = this.get(id) ?? this.createNotFoundTask(id);
    return { matched: false, task };
  }

  /**
   * Delete a task from storage.
   *
   * @param id Task ID
   * @returns True if deleted, false if not found
   */
  delete(id: string): boolean {
    // Kill if still running
    if (this.active.has(id)) {
      this.kill(id);
    }

    return this.store.delete(id);
  }

  /**
   * Get count of running tasks.
   */
  runningCount(): number {
    return this.active.size;
  }

  /**
   * Graceful shutdown - kill all running tasks and close store.
   */
  async shutdown(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Kill all running tasks
    for (const id of this.active.keys()) {
      this.kill(id, "SIGTERM");
    }

    // Wait a moment for graceful shutdown
    await this.sleep(100);

    // Force kill any remaining
    for (const id of this.active.keys()) {
      this.kill(id, "SIGKILL");
    }

    // Close database
    this.store.close();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle output from a process.
   */
  private handleOutput(id: string, data: string): void {
    const active = this.active.get(id);
    if (!active) return;

    // Clean the output
    const cleaned = cleanOutput(data);
    if (!cleaned) return;

    // Add to pending buffer
    active.pendingOutput.push(cleaned);

    // Schedule flush if not already scheduled
    if (!active.flushTimer) {
      active.flushTimer = setTimeout(() => {
        this.flushOutput(id);
      }, this.config.flushInterval);
    }
  }

  /**
   * Flush pending output to store.
   */
  private flushOutput(id: string): void {
    const active = this.active.get(id);
    if (!active || active.pendingOutput.length === 0) return;

    // Clear timer
    if (active.flushTimer) {
      clearTimeout(active.flushTimer);
      active.flushTimer = null;
    }

    // Join and clean pending output
    const chunk = active.pendingOutput.join("\n");
    active.pendingOutput = [];

    // Append to store (handles truncation)
    this.store.appendOutput(id, chunk + "\n", this.config.maxOutputSize);
  }

  /**
   * Handle process exit.
   */
  private handleExit(id: string, code: number | null, signal: string | null): void {
    // Flush any remaining output
    this.flushOutput(id);

    // Determine status
    let status: TaskStatus;
    if (signal) {
      status = "killed";
    } else if (code === 0) {
      status = "done";
    } else {
      status = "failed";
    }

    // Update store
    this.store.updateStatus(id, status, code, new Date());

    // Cleanup
    this.cleanupActive(id);
  }

  /**
   * Handle spawn error.
   */
  private handleError(id: string, error: Error): void {
    // Flush any output we have
    this.flushOutput(id);

    // Add error to output
    this.store.appendOutput(id, `\nError: ${error.message}\n`, this.config.maxOutputSize);

    // Update status
    this.store.updateStatus(id, "failed", 1, new Date());

    // Cleanup
    this.cleanupActive(id);
  }

  /**
   * Clean up active task tracking.
   */
  private cleanupActive(id: string): void {
    const active = this.active.get(id);
    if (active?.flushTimer) {
      clearTimeout(active.flushTimer);
    }
    this.active.delete(id);
  }

  /**
   * Wait for a task to exit.
   *
   * @returns True if timed out, false if exited
   */
  private waitForExit(id: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const active = this.active.get(id);

      // Already exited
      if (!active) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        resolve(true); // Timed out
      }, timeoutMs);

      const onExit = (): void => {
        cleanup();
        resolve(false); // Exited normally
      };

      const cleanup = (): void => {
        clearTimeout(timeout);
        active.process.off("exit", onExit);
      };

      active.process.on("exit", onExit);
    });
  }

  /**
   * Start periodic cleanup of old tasks.
   */
  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, 5 * 60 * 1000);

    // Run initial cleanup
    this.runCleanup();
  }

  /**
   * Run cleanup of old tasks.
   */
  private runCleanup(): void {
    // Delete tasks older than max age
    const deletedOld = this.store.cleanupOld(this.config.cleanupAge);

    // Enforce max completed count
    const deletedExcess = this.store.enforceMaxCompleted(this.config.maxCompletedTasks);

    const total = deletedOld + deletedExcess;
    if (total > 0) {
      console.error(`[task-runner] Cleaned up ${total} old task(s)`);
    }
  }

  /**
   * Create a placeholder task for "not found" responses.
   */
  private createNotFoundTask(id: string): Task {
    return {
      id,
      command: "(unknown)",
      label: null,
      cwd: null,
      status: "orphaned",
      exitCode: null,
      startedAt: new Date(),
      endedAt: null,
      output: "Task not found",
      truncated: false,
    };
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

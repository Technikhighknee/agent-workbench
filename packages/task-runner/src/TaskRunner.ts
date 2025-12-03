/**
 * TaskRunner - Process manager for AI agents.
 *
 * Architecture:
 * - Detached processes survive MCP server restarts
 * - Output stored in log files (non-blocking, OS-buffered)
 * - Metadata in JSON (atomic writes, crash-safe)
 * - PID + start time for reliable process identification
 *
 * Principles:
 * - Crash-Only Design: Recovery = startup, no special shutdown required
 * - Single Source of Truth: PID for status, log file for output
 * - Fail-Safe Defaults: Assume dead if uncertain
 * - Bounded Resources: Configurable limits, auto-cleanup
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
  statSync,
  readdirSync,
  renameSync,
  readSync,
} from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";

import type {
  Task,
  StartOptions,
  RunOptions,
  RunResult,
  WaitOptions,
  WaitResult,
  TaskRunnerConfig,
  CleanupResult,
  ActiveTask,
} from "./model.js";
import {
  DEFAULT_CONFIG,
  DEFAULT_RUN_TIMEOUT,
  DEFAULT_WAIT_TIMEOUT,
} from "./model.js";
import { cleanOutput } from "./cleanOutput.js";

/**
 * Process manager for long-running tasks.
 */
export class TaskRunner {
  private readonly config: Required<TaskRunnerConfig>;
  private readonly tasksFile: string;
  private readonly logsDir: string;
  private readonly lockFile: string;

  private tasks = new Map<string, Task>();
  private active = new Map<string, ActiveTask>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(config: TaskRunnerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Resolve paths
    this.tasksFile = join(this.config.dataDir, "tasks.json");
    this.logsDir = join(this.config.dataDir, "logs");
    this.lockFile = join(this.config.dataDir, ".lock");
  }

  /**
   * Initialize the task runner.
   * Must be called before any other operations.
   *
   * - Creates data directories
   * - Acquires lock (single instance)
   * - Loads and reconciles state
   * - Starts cleanup timer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directories
    mkdirSync(this.config.dataDir, { recursive: true });
    mkdirSync(this.logsDir, { recursive: true });

    // Acquire lock
    this.acquireLock();

    // Load tasks and reconcile with reality
    this.loadTasks();
    const orphaned = this.reconcile();
    if (orphaned > 0) {
      console.error(`[task-runner] Marked ${orphaned} task(s) as orphaned`);
    }
    this.saveTasks();

    // Start cleanup timer
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
      this.cleanupTimer.unref(); // Don't keep process alive
    }

    // Initial cleanup
    this.cleanup();

    this.initialized = true;
  }

  /**
   * Start a background task (detached, survives restarts).
   */
  start(command: string, options: StartOptions = {}): Task {
    this.ensureInitialized();

    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      throw new Error("Command cannot be empty");
    }

    const id = nanoid(12);
    const logFile = join(this.logsDir, `${id}.log`);
    const cwd = options.cwd ?? process.cwd();

    // Open log file for writing
    const logFd = openSync(logFile, "a");

    // Spawn detached process with output redirected to log file
    const proc = spawn(trimmedCommand, [], {
      shell: true,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      cwd,
      env: { ...process.env, ...options.env },
    });

    // Don't keep MCP server alive for this process
    proc.unref();

    const task: Task = {
      id,
      command: trimmedCommand,
      label: options.label ?? null,
      cwd,
      status: "running",
      pid: proc.pid!,
      logFile,
      exitCode: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      truncated: false,
    };

    // Track active task
    this.active.set(id, {
      task,
      logFd,
      outputSize: 0,
    });

    // Handle process exit
    proc.on("exit", (code, signal) => {
      this.handleExit(id, code, signal);
    });

    proc.on("error", (err) => {
      console.error(`[task-runner] Process error for ${id}: ${err.message}`);
      this.handleExit(id, 1, null);
    });

    // Save to persistent storage
    this.tasks.set(id, task);
    this.saveTasks();

    return task;
  }

  /**
   * Run a command and wait for completion (or timeout).
   * For short-lived commands like builds/tests.
   */
  async run(command: string, options: RunOptions = {}): Promise<RunResult> {
    const task = this.start(command, options);
    const timeout = options.timeout ?? DEFAULT_RUN_TIMEOUT;

    const timedOut = await this.waitForExit(task.id, timeout);
    const finalTask = this.tasks.get(task.id)!;
    const output = this.getOutput(task.id);

    return { task: finalTask, output, timedOut };
  }

  /**
   * Get a task by ID.
   * Checks if still running and updates status.
   */
  get(id: string): Task | null {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return null;

    // If marked as running, verify it's still alive
    if (task.status === "running" && !this.active.has(id)) {
      if (!this.isProcessAlive(task.pid, task.startedAt)) {
        task.status = "orphaned";
        task.endedAt = new Date().toISOString();
        this.saveTasks();
      }
    }

    return task;
  }

  /**
   * List all tasks, optionally filtered to running only.
   * Verifies running status for each task.
   */
  list(runningOnly = false): Task[] {
    this.ensureInitialized();

    // Verify running tasks are still alive
    let needsSave = false;
    for (const task of this.tasks.values()) {
      if (task.status === "running" && !this.active.has(task.id)) {
        if (!this.isProcessAlive(task.pid, task.startedAt)) {
          task.status = "orphaned";
          task.endedAt = new Date().toISOString();
          needsSave = true;
        }
      }
    }
    if (needsSave) {
      this.saveTasks();
    }

    const tasks = Array.from(this.tasks.values());
    if (runningOnly) {
      return tasks.filter((t) => t.status === "running");
    }
    return tasks.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Kill a running task.
   */
  kill(id: string, force = false): boolean {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.status !== "running") {
      return true; // Already not running, idempotent success
    }

    try {
      // Kill process group (negative PID)
      const signal = force ? "SIGKILL" : "SIGTERM";
      process.kill(-task.pid, signal);
    } catch {
      // Process already dead, that's fine
    }

    task.status = "killed";
    task.endedAt = new Date().toISOString();

    // Clean up active state
    const active = this.active.get(id);
    if (active) {
      try {
        closeSync(active.logFd);
      } catch {
        // Ignore close errors
      }
      this.active.delete(id);
    }

    this.saveTasks();
    return true;
  }

  /**
   * Delete a task and its log file.
   */
  delete(id: string): boolean {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return false;

    // Kill if still running
    if (task.status === "running") {
      this.kill(id, true);
    }

    // Delete log file
    try {
      unlinkSync(task.logFile);
    } catch {
      // File may not exist, that's fine
    }

    this.tasks.delete(id);
    this.saveTasks();
    return true;
  }

  /**
   * Get task output from log file.
   */
  getOutput(id: string, options: { tail?: number; maxSize?: number } = {}): string {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return "";

    const { tail, maxSize = 1024 * 1024 } = options; // Default 1MB max

    try {
      if (!existsSync(task.logFile)) {
        return "";
      }

      if (tail) {
        return this.tailFile(task.logFile, tail);
      }

      const stats = statSync(task.logFile);
      if (stats.size > maxSize) {
        // Return last maxSize bytes with truncation notice
        return (
          "[Output truncated. Use tail option for more.]\n\n" +
          this.tailBytes(task.logFile, maxSize)
        );
      }

      return cleanOutput(readFileSync(task.logFile, "utf-8"));
    } catch {
      return ""; // File missing or unreadable
    }
  }

  /**
   * Wait for a pattern to appear in output.
   */
  async waitFor(id: string, options: WaitOptions): Promise<WaitResult> {
    this.ensureInitialized();

    const { pattern, timeout = DEFAULT_WAIT_TIMEOUT } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const task = this.get(id);
      if (!task) {
        return { matched: false, task: this.createNotFoundTask(id), output: "" };
      }

      const output = this.getOutput(id);
      if (pattern.test(output)) {
        return { matched: true, task, output };
      }

      // Task finished without match
      if (task.status !== "running") {
        return { matched: false, task, output };
      }

      // Wait a bit before checking again
      await this.sleep(100);
    }

    const task = this.get(id)!;
    const output = this.getOutput(id);
    return { matched: false, task, output };
  }

  /**
   * Get count of running tasks.
   */
  runningCount(): number {
    return Array.from(this.tasks.values()).filter((t) => t.status === "running")
      .length;
  }

  /**
   * Cleanup old tasks and logs.
   */
  cleanup(): CleanupResult {
    if (!this.initialized) {
      return { deletedTasks: 0, deletedLogs: 0, truncatedLogs: 0 };
    }

    const result: CleanupResult = {
      deletedTasks: 0,
      deletedLogs: 0,
      truncatedLogs: 0,
    };

    const now = Date.now();
    const completedTasks = Array.from(this.tasks.values())
      .filter((t) => t.status !== "running")
      .sort(
        (a, b) =>
          new Date(b.endedAt ?? b.startedAt).getTime() -
          new Date(a.endedAt ?? a.startedAt).getTime()
      );

    // Delete old tasks
    for (let i = 0; i < completedTasks.length; i++) {
      const task = completedTasks[i];
      const age = now - new Date(task.endedAt ?? task.startedAt).getTime();

      // Delete if too old or over max count
      if (age > this.config.maxAge || i >= this.config.maxTasks) {
        try {
          unlinkSync(task.logFile);
          result.deletedLogs++;
        } catch {
          // File may not exist
        }
        this.tasks.delete(task.id);
        result.deletedTasks++;
      }
    }

    // Truncate large log files
    for (const task of this.tasks.values()) {
      try {
        if (!existsSync(task.logFile)) continue;
        const stats = statSync(task.logFile);
        if (stats.size > this.config.maxLogSize) {
          this.truncateLogFile(task.logFile, this.config.maxLogSize);
          task.truncated = true;
          result.truncatedLogs++;
        }
      } catch {
        // File may not exist
      }
    }

    // Clean orphan log files (no matching task)
    try {
      const logFiles = readdirSync(this.logsDir);
      const taskIds = new Set(Array.from(this.tasks.keys()));

      for (const file of logFiles) {
        const id = file.replace(/\.log$/, "");
        if (!taskIds.has(id)) {
          try {
            unlinkSync(join(this.logsDir, file));
            result.deletedLogs++;
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // Directory may not exist
    }

    if (result.deletedTasks > 0 || result.truncatedLogs > 0) {
      this.saveTasks();
    }

    return result;
  }

  /**
   * Shutdown the task runner.
   * Saves state but does NOT kill running processes (they're detached).
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all log file descriptors
    for (const active of this.active.values()) {
      try {
        closeSync(active.logFd);
      } catch {
        // Ignore
      }
    }
    this.active.clear();

    // Final save
    this.saveTasks();

    // Release lock
    this.releaseLock();

    this.initialized = false;
  }

  // ============================================================
  // Private methods
  // ============================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("TaskRunner not initialized. Call initialize() first.");
    }
  }

  /**
   * Acquire exclusive lock (single instance).
   */
  private acquireLock(): void {
    try {
      // Try to create lock file exclusively
      writeFileSync(this.lockFile, String(process.pid), { flag: "wx" });
    } catch {
      // Lock exists - check if owner is alive
      try {
        const ownerPid = parseInt(readFileSync(this.lockFile, "utf-8"), 10);
        if (this.isPidAlive(ownerPid)) {
          throw new Error(
            `Another task-runner instance is running (PID ${ownerPid})`
          );
        }
        // Owner dead, take over
        writeFileSync(this.lockFile, String(process.pid));
      } catch (e) {
        if (e instanceof Error && e.message.includes("Another task-runner")) {
          throw e;
        }
        // Can't read lock file, just overwrite
        writeFileSync(this.lockFile, String(process.pid));
      }
    }
  }

  private releaseLock(): void {
    try {
      unlinkSync(this.lockFile);
    } catch {
      // Ignore
    }
  }

  /**
   * Load tasks from JSON file.
   */
  private loadTasks(): void {
    try {
      if (!existsSync(this.tasksFile)) {
        this.tasks = new Map();
        return;
      }
      const data = readFileSync(this.tasksFile, "utf-8");
      const tasks = JSON.parse(data) as Task[];
      this.tasks = new Map(tasks.map((t) => [t.id, t]));
    } catch (e) {
      // File doesn't exist or is corrupt - start fresh
      console.error("[task-runner] Could not load tasks.json, starting fresh");
      this.tasks = new Map();
    }
  }

  /**
   * Save tasks to JSON file (atomic write).
   */
  private saveTasks(): void {
    const data = JSON.stringify(Array.from(this.tasks.values()), null, 2);
    const tmpFile = this.tasksFile + ".tmp";

    try {
      writeFileSync(tmpFile, data);
      renameSync(tmpFile, this.tasksFile); // Atomic on POSIX
    } catch (e) {
      console.error("[task-runner] Failed to save tasks:", e);
    }
  }

  /**
   * Reconcile tasks with actual running processes.
   * Returns count of orphaned tasks.
   */
  private reconcile(): number {
    let orphanedCount = 0;

    for (const task of this.tasks.values()) {
      if (task.status === "running") {
        if (this.isProcessAlive(task.pid, task.startedAt)) {
          // Process is still running - we've "reconnected"
          console.error(`[task-runner] Reconnected to task ${task.id} (PID ${task.pid})`);
        } else {
          // Process died while we were down
          task.status = "orphaned";
          task.endedAt = new Date().toISOString();
          orphanedCount++;
        }
      }
    }

    return orphanedCount;
  }

  /**
   * Check if a PID is alive and matches our expected start time.
   */
  private isProcessAlive(pid: number, expectedStartTime: string): boolean {
    if (!this.isPidAlive(pid)) {
      return false;
    }

    // Get process start time and compare
    // This handles PID reuse - if the PID was reused for a different process,
    // its start time will be different
    try {
      const procStartTime = this.getProcessStartTime(pid);
      const taskStartTime = new Date(expectedStartTime).getTime();

      // Allow 5 second tolerance for start time comparison
      return Math.abs(procStartTime - taskStartTime) < 5000;
    } catch {
      // Can't get start time - assume it's our process if PID exists
      // This is less safe but works on non-Linux systems
      return true;
    }
  }

  /**
   * Check if a PID exists (process is alive).
   */
  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // Signal 0 = check existence
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get process start time in milliseconds since epoch.
   */
  private getProcessStartTime(pid: number): number {
    // On Linux, read from /proc/{pid}/stat
    // Field 22 is starttime in clock ticks since boot
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
      const fields = stat.split(" ");
      const startTimeTicks = parseInt(fields[21], 10);
      const uptimeSeconds = parseFloat(
        readFileSync("/proc/uptime", "utf-8").split(" ")[0]
      );
      const bootTime = Date.now() - uptimeSeconds * 1000;
      const ticksPerSecond = 100; // Usually 100 on Linux
      return bootTime + (startTimeTicks / ticksPerSecond) * 1000;
    } catch {
      // Non-Linux: throw to trigger fallback behavior
      throw new Error("Cannot get process start time on this platform");
    }
  }

  /**
   * Handle process exit.
   */
  private handleExit(
    id: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    const task = this.tasks.get(id);
    if (!task) return;

    // Determine status
    if (signal) {
      task.status = signal === "SIGTERM" || signal === "SIGKILL" ? "killed" : "failed";
    } else {
      task.status = code === 0 ? "done" : "failed";
    }

    task.exitCode = code;
    task.endedAt = new Date().toISOString();

    // Clean up active state
    const active = this.active.get(id);
    if (active) {
      try {
        closeSync(active.logFd);
      } catch {
        // Ignore
      }
      this.active.delete(id);
    }

    this.saveTasks();
  }

  /**
   * Wait for a task to exit (or timeout).
   */
  private waitForExit(id: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = (): void => {
        const task = this.tasks.get(id);
        if (!task || task.status !== "running") {
          resolve(false);
          return;
        }

        // Also check if process is still alive (in case exit event was missed)
        if (!this.active.has(id) && !this.isProcessAlive(task.pid, task.startedAt)) {
          task.status = "orphaned";
          task.endedAt = new Date().toISOString();
          this.saveTasks();
          resolve(false);
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          resolve(true); // Timed out
          return;
        }

        setTimeout(check, 100);
      };

      // Start checking immediately
      check();
    });
  }

  /**
   * Read last N lines from a file.
   */
  /**
   * Read last N lines from a file.
   */
  private tailFile(filePath: string, lines: number): string {
    try {
      const content = readFileSync(filePath, "utf-8");
      // Split and filter trailing empty line (from trailing newline)
      const allLines = content.split("\n");
      // Remove trailing empty string if file ends with newline
      if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
        allLines.pop();
      }
      return cleanOutput(allLines.slice(-lines).join("\n"));
    } catch {
      return "";
    }
  }

  /**
   * Read last N bytes from a file.
   */
  private tailBytes(filePath: string, bytes: number): string {
    try {
      const stats = statSync(filePath);
      if (stats.size <= bytes) {
        return readFileSync(filePath, "utf-8");
      }

      const fd = openSync(filePath, "r");
      const buffer = Buffer.alloc(bytes);
      const startPos = stats.size - bytes;

      readSync(fd, buffer, 0, bytes, startPos);
      closeSync(fd);

      return cleanOutput(buffer.toString("utf-8"));
    } catch {
      return "";
    }
  }

  /**
   * Truncate a log file to the specified size (keeping the end).
   */
  private truncateLogFile(filePath: string, maxSize: number): void {
    try {
      const content = this.tailBytes(filePath, maxSize - 50);
      const truncatedContent =
        "[Log truncated due to size limit]\n\n" + content;
      writeFileSync(filePath, truncatedContent);
    } catch {
      // Ignore truncation errors
    }
  }

  /**
   * Create a placeholder task for "not found" responses.
   */
  private createNotFoundTask(id: string): Task {
    return {
      id,
      command: "",
      label: null,
      cwd: null,
      status: "orphaned",
      pid: 0,
      logFile: "",
      exitCode: null,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      truncated: false,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

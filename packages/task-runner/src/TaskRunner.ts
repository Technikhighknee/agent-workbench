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
  unlinkSync,
  openSync,
  closeSync,
  statSync,
  readdirSync,
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
import { isProcessAlive } from "./processUtils.js";
import { tailFile, tailBytes, truncateLogFile } from "./fileUtils.js";
import { TaskPersistence } from "./TaskPersistence.js";
import { LockManager } from "./LockManager.js";

/**
 * Process manager for long-running tasks.
 */
export class TaskRunner {
  private readonly config: Required<TaskRunnerConfig>;
  private readonly logsDir: string;
  private readonly persistence: TaskPersistence;
  private readonly lockManager: LockManager;

  private tasks = new Map<string, Task>();
  private active = new Map<string, ActiveTask>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(config: TaskRunnerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const tasksFile = join(this.config.dataDir, "tasks.json");
    const lockFile = join(this.config.dataDir, ".lock");
    this.logsDir = join(this.config.dataDir, "logs");

    this.persistence = new TaskPersistence(tasksFile);
    this.lockManager = new LockManager(lockFile);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    mkdirSync(this.config.dataDir, { recursive: true });
    mkdirSync(this.logsDir, { recursive: true });

    this.lockManager.acquire();
    this.tasks = this.persistence.load();

    const orphaned = this.reconcile();
    if (orphaned > 0) {
      console.error(`[task-runner] Marked ${orphaned} task(s) as orphaned`);
    }
    this.persistence.save(this.tasks);

    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
      this.cleanupTimer.unref();
    }

    this.cleanup();
    this.initialized = true;
  }

  start(command: string, options: StartOptions = {}): Task {
    this.ensureInitialized();

    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      throw new Error("Command cannot be empty");
    }

    const id = nanoid(12);
    const logFile = join(this.logsDir, `${id}.log`);
    const cwd = options.cwd ?? process.cwd();

    const logFd = openSync(logFile, "a");

    const proc = spawn(trimmedCommand, [], {
      shell: true,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      cwd,
      env: { ...process.env, ...options.env },
    });

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

    this.active.set(id, { task, logFd, outputSize: 0 });

    proc.on("exit", (code, signal) => {
      this.handleExit(id, code, signal);
    });

    proc.on("error", (err) => {
      console.error(`[task-runner] Process error for ${id}: ${err.message}`);
      this.handleExit(id, 1, null);
    });

    this.tasks.set(id, task);
    this.persistence.save(this.tasks);

    return task;
  }

  async run(command: string, options: RunOptions = {}): Promise<RunResult> {
    const task = this.start(command, options);
    const timeout = options.timeout ?? DEFAULT_RUN_TIMEOUT;

    const timedOut = await this.waitForExit(task.id, timeout);
    const finalTask = this.tasks.get(task.id)!;
    const output = this.getOutput(task.id);

    return { task: finalTask, output, timedOut };
  }

  get(id: string): Task | null {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return null;

    if (task.status === "running" && !this.active.has(id)) {
      if (!isProcessAlive(task.pid, task.startedAt)) {
        task.status = "orphaned";
        task.endedAt = new Date().toISOString();
        this.persistence.save(this.tasks);
      }
    }

    return task;
  }

  list(runningOnly = false): Task[] {
    this.ensureInitialized();

    let needsSave = false;
    for (const task of this.tasks.values()) {
      if (task.status === "running" && !this.active.has(task.id)) {
        if (!isProcessAlive(task.pid, task.startedAt)) {
          task.status = "orphaned";
          task.endedAt = new Date().toISOString();
          needsSave = true;
        }
      }
    }
    if (needsSave) {
      this.persistence.save(this.tasks);
    }

    const tasks = Array.from(this.tasks.values());
    if (runningOnly) {
      return tasks.filter((t) => t.status === "running");
    }
    return tasks.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  kill(id: string, force = false): boolean {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.status !== "running") {
      return true;
    }

    try {
      const signal = force ? "SIGKILL" : "SIGTERM";
      process.kill(-task.pid, signal);
    } catch {
      // Process already dead
    }

    task.status = "killed";
    task.endedAt = new Date().toISOString();

    const active = this.active.get(id);
    if (active) {
      try {
        closeSync(active.logFd);
      } catch {
        // Ignore
      }
      this.active.delete(id);
    }

    this.persistence.save(this.tasks);
    return true;
  }

  delete(id: string): boolean {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.status === "running") {
      this.kill(id, true);
    }

    try {
      unlinkSync(task.logFile);
    } catch {
      // File may not exist
    }

    this.tasks.delete(id);
    this.persistence.save(this.tasks);
    return true;
  }

  getOutput(id: string, options: { tail?: number; maxSize?: number } = {}): string {
    this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) return "";

    const { tail, maxSize = 1024 * 1024 } = options;

    try {
      if (!existsSync(task.logFile)) {
        return "";
      }

      if (tail) {
        return tailFile(task.logFile, tail);
      }

      const stats = statSync(task.logFile);
      if (stats.size > maxSize) {
        return (
          "[Output truncated. Use tail option for more.]\n\n" +
          tailBytes(task.logFile, maxSize)
        );
      }

      return cleanOutput(readFileSync(task.logFile, "utf-8"));
    } catch {
      return "";
    }
  }

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

      if (task.status !== "running") {
        return { matched: false, task, output };
      }

      await this.sleep(100);
    }

    const task = this.get(id)!;
    const output = this.getOutput(id);
    return { matched: false, task, output };
  }

  runningCount(): number {
    return Array.from(this.tasks.values()).filter((t) => t.status === "running")
      .length;
  }

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

    for (let i = 0; i < completedTasks.length; i++) {
      const task = completedTasks[i];
      const age = now - new Date(task.endedAt ?? task.startedAt).getTime();

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

    for (const task of this.tasks.values()) {
      try {
        if (!existsSync(task.logFile)) continue;
        const stats = statSync(task.logFile);
        if (stats.size > this.config.maxLogSize) {
          truncateLogFile(task.logFile, this.config.maxLogSize);
          task.truncated = true;
          result.truncatedLogs++;
        }
      } catch {
        // File may not exist
      }
    }

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
      this.persistence.save(this.tasks);
    }

    return result;
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const active of this.active.values()) {
      try {
        closeSync(active.logFd);
      } catch {
        // Ignore
      }
    }
    this.active.clear();

    this.persistence.save(this.tasks);
    this.lockManager.release();
    this.initialized = false;
  }

  // Private methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("TaskRunner not initialized. Call initialize() first.");
    }
  }

  private reconcile(): number {
    let orphanedCount = 0;

    for (const task of this.tasks.values()) {
      if (task.status === "running") {
        if (isProcessAlive(task.pid, task.startedAt)) {
          console.error(`[task-runner] Reconnected to task ${task.id} (PID ${task.pid})`);
        } else {
          task.status = "orphaned";
          task.endedAt = new Date().toISOString();
          orphanedCount++;
        }
      }
    }

    return orphanedCount;
  }

  private handleExit(
    id: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    const task = this.tasks.get(id);
    if (!task) return;

    if (signal) {
      task.status = signal === "SIGTERM" || signal === "SIGKILL" ? "killed" : "failed";
    } else {
      task.status = code === 0 ? "done" : "failed";
    }

    task.exitCode = code;
    task.endedAt = new Date().toISOString();

    const active = this.active.get(id);
    if (active) {
      try {
        closeSync(active.logFd);
      } catch {
        // Ignore
      }
      this.active.delete(id);
    }

    this.persistence.save(this.tasks);
  }

  private waitForExit(id: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = (): void => {
        const task = this.tasks.get(id);
        if (!task || task.status !== "running") {
          resolve(false);
          return;
        }

        if (!this.active.has(id) && !isProcessAlive(task.pid, task.startedAt)) {
          task.status = "orphaned";
          task.endedAt = new Date().toISOString();
          this.persistence.save(this.tasks);
          resolve(false);
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          resolve(true);
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

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

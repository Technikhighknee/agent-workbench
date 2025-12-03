/**
 * Tests for TaskRunner - the process manager for AI agents.
 *
 * These tests cover:
 * - Initialization and lifecycle
 * - Starting and running tasks
 * - Task state management (get, list, kill, delete)
 * - Output retrieval
 * - Pattern matching (waitFor)
 * - Persistence and recovery
 * - Cleanup
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TaskRunner } from "../src/TaskRunner.js";
import type { Task } from "../src/model.js";

// Use unique temp directory for each test run
const TEST_DATA_DIR = join(process.cwd(), ".test-task-runner-" + process.pid);

describe("TaskRunner", () => {
  let runner: TaskRunner;

  beforeEach(async () => {
    // Clean up any existing test data
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Shutdown runner if it exists
    if (runner) {
      try {
        await runner.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }

    // Clean up test data
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe("Initialization", () => {
    it("should require initialize() before other operations", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });

      // start() should throw before initialize
      expect(() => runner.start("echo hello")).toThrow(
        "TaskRunner not initialized"
      );

      // get() should throw before initialize
      expect(() => runner.get("any-id")).toThrow(
        "TaskRunner not initialized"
      );

      // list() should throw before initialize
      expect(() => runner.list()).toThrow("TaskRunner not initialized");

      // After initialize, should work
      await runner.initialize();
      const tasks = runner.list();
      expect(tasks).toEqual([]);
    });

    it("should create data directories on initialize", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      expect(existsSync(TEST_DATA_DIR)).toBe(true);
      expect(existsSync(join(TEST_DATA_DIR, "logs"))).toBe(true);
    });

    it("should be idempotent - multiple initialize calls are safe", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
      await runner.initialize(); // Should not throw
      await runner.initialize(); // Should not throw

      expect(runner.list()).toEqual([]);
    });

    it("should prevent multiple instances from running", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      // Try to create second instance
      const runner2 = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await expect(runner2.initialize()).rejects.toThrow(
        "Another task-runner instance is running"
      );
    });
  });

  describe("start() - Background Tasks", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should start a background task", () => {
      const task = runner.start("echo hello");

      expect(task.id).toBeDefined();
      expect(task.command).toBe("echo hello");
      expect(task.status).toBe("running");
      expect(task.pid).toBeGreaterThan(0);
      expect(task.startedAt).toBeDefined();
      expect(task.endedAt).toBeNull();
    });

    it("should support labels", () => {
      const task = runner.start("echo hello", { label: "greeting" });
      expect(task.label).toBe("greeting");
    });

    it("should support custom working directory", () => {
      const task = runner.start("pwd", { cwd: "/tmp" });
      expect(task.cwd).toBe("/tmp");
    });

    it("should throw on empty command", () => {
      expect(() => runner.start("")).toThrow("Command cannot be empty");
      expect(() => runner.start("   ")).toThrow("Command cannot be empty");
    });

    it("should persist tasks to disk", () => {
      const task = runner.start("sleep 10");

      // Read tasks file directly
      const tasksFile = join(TEST_DATA_DIR, "tasks.json");
      expect(existsSync(tasksFile)).toBe(true);

      const tasks = JSON.parse(readFileSync(tasksFile, "utf-8"));
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
    });

    it("should create log file for task output", () => {
      const task = runner.start("echo hello");
      expect(existsSync(task.logFile)).toBe(true);
    });
  });

  describe("run() - Wait for Completion", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should run a command and wait for completion", async () => {
      const result = await runner.run("echo hello world");

      expect(result.timedOut).toBe(false);
      expect(result.task.status).toBe("done");
      expect(result.task.exitCode).toBe(0);
      expect(result.output).toContain("hello world");
    });

    it("should capture exit code on failure", async () => {
      const result = await runner.run("exit 42");

      expect(result.timedOut).toBe(false);
      expect(result.task.status).toBe("failed");
      expect(result.task.exitCode).toBe(42);
    });

    it("should timeout if command takes too long", async () => {
      const result = await runner.run("sleep 10", { timeout: 200 });

      expect(result.timedOut).toBe(true);
      expect(result.task.status).toBe("running");

      // Clean up
      runner.kill(result.task.id, true);
    });

    it("should capture stdout", async () => {
      const result = await runner.run('echo "line1"; echo "line2"');

      expect(result.output).toContain("line1");
      expect(result.output).toContain("line2");
    });

    it("should capture stderr", async () => {
      const result = await runner.run("echo error >&2");

      expect(result.output).toContain("error");
    });
  });

  describe("get() and list()", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should get task by id", () => {
      const task = runner.start("sleep 10");
      const retrieved = runner.get(task.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(task.id);
      expect(retrieved!.command).toBe("sleep 10");

      // Clean up
      runner.kill(task.id, true);
    });

    it("should return null for unknown id", () => {
      expect(runner.get("nonexistent")).toBeNull();
    });

    it("should list all tasks", async () => {
      await runner.run("echo one");
      await runner.run("echo two");
      runner.start("sleep 10");

      const tasks = runner.list();
      expect(tasks).toHaveLength(3);

      // Clean up running task
      const running = tasks.find((t) => t.status === "running");
      if (running) runner.kill(running.id, true);
    });

    it("should list only running tasks when filtered", async () => {
      await runner.run("echo done");
      runner.start("sleep 10");

      const running = runner.list(true);
      expect(running).toHaveLength(1);
      expect(running[0].status).toBe("running");

      // Clean up
      runner.kill(running[0].id, true);
    });

    it("should return tasks sorted by start time (newest first)", async () => {
      await runner.run("echo first");
      await new Promise((r) => setTimeout(r, 50));
      await runner.run("echo second");

      const tasks = runner.list();
      expect(tasks[0].command).toContain("second");
      expect(tasks[1].command).toContain("first");
    });
  });

  describe("kill()", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should kill a running task", async () => {
      const task = runner.start("sleep 60");
      expect(task.status).toBe("running");

      const killed = runner.kill(task.id);
      expect(killed).toBe(true);

      // Give process time to die
      await new Promise((r) => setTimeout(r, 100));

      const updated = runner.get(task.id);
      expect(updated!.status).toBe("killed");
      expect(updated!.endedAt).not.toBeNull();
    });

    it("should return true for already completed tasks (idempotent)", async () => {
      const result = await runner.run("echo done");
      expect(result.task.status).toBe("done");

      const killed = runner.kill(result.task.id);
      expect(killed).toBe(true);
    });

    it("should return false for unknown task id", () => {
      expect(runner.kill("nonexistent")).toBe(false);
    });

    it("should support force kill", async () => {
      const task = runner.start("sleep 60");

      const killed = runner.kill(task.id, true);
      expect(killed).toBe(true);

      await new Promise((r) => setTimeout(r, 100));
      const updated = runner.get(task.id);
      expect(updated!.status).toBe("killed");
    });
  });

  describe("delete()", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should delete a task and its log file", async () => {
      const result = await runner.run("echo hello");
      const logFile = result.task.logFile;

      expect(existsSync(logFile)).toBe(true);

      const deleted = runner.delete(result.task.id);
      expect(deleted).toBe(true);

      expect(runner.get(result.task.id)).toBeNull();
      expect(existsSync(logFile)).toBe(false);
    });

    it("should kill running task before deleting", async () => {
      const task = runner.start("sleep 60");
      expect(task.status).toBe("running");

      const deleted = runner.delete(task.id);
      expect(deleted).toBe(true);

      // Task should be gone
      expect(runner.get(task.id)).toBeNull();
    });

    it("should return false for unknown task id", () => {
      expect(runner.delete("nonexistent")).toBe(false);
    });
  });

  describe("getOutput()", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should get task output", async () => {
      const result = await runner.run("echo hello world");
      const output = runner.getOutput(result.task.id);

      expect(output).toContain("hello world");
    });

    it("should return empty string for unknown task", () => {
      expect(runner.getOutput("nonexistent")).toBe("");
    });

    it("should support tail option", async () => {
      const result = await runner.run(
        'echo "line1"; echo "line2"; echo "line3"; echo "line4"'
      );
      const output = runner.getOutput(result.task.id, { tail: 2 });

      const lines = output.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("line3");
      expect(lines[1]).toContain("line4");
    });

    it("should handle empty output", async () => {
      const result = await runner.run("true");
      const output = runner.getOutput(result.task.id);

      expect(output).toBe("");
    });
  });

  describe("waitFor()", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should wait for pattern in output", async () => {
      const task = runner.start(
        'sleep 0.1 && echo "server ready" && sleep 10'
      );

      const result = await runner.waitFor(task.id, {
        pattern: /ready/,
        timeout: 5000,
      });

      expect(result.matched).toBe(true);
      expect(result.output).toContain("server ready");

      // Clean up
      runner.kill(task.id, true);
    });

    it("should return false if pattern not found before timeout", async () => {
      const task = runner.start("echo no match here");

      const result = await runner.waitFor(task.id, {
        pattern: /never-gonna-find-this/,
        timeout: 500,
      });

      expect(result.matched).toBe(false);
    });

    it("should return false if task completes without match", async () => {
      const task = runner.start("echo quick exit");

      // Wait for task to complete
      await new Promise((r) => setTimeout(r, 200));

      const result = await runner.waitFor(task.id, {
        pattern: /never-gonna-find-this/,
        timeout: 1000,
      });

      expect(result.matched).toBe(false);
      expect(result.task.status).not.toBe("running");
    });

    it("should handle nonexistent task", async () => {
      const result = await runner.waitFor("nonexistent", {
        pattern: /anything/,
        timeout: 100,
      });

      expect(result.matched).toBe(false);
      expect(result.task.status).toBe("orphaned");
    });
  });

  describe("Persistence and Recovery", () => {
    it("should persist tasks across runner instances", async () => {
      // Start a task with first runner
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
      const task = runner.start("sleep 60");
      await runner.shutdown();

      // Create new runner and verify task is there
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      const recovered = runner.get(task.id);
      expect(recovered).not.toBeNull();
      expect(recovered!.command).toBe("sleep 60");

      // Status should be either running (if process still alive) or orphaned
      expect(["running", "orphaned"]).toContain(recovered!.status);

      // Clean up
      runner.kill(task.id, true);
    });

    it("should mark tasks as orphaned if process died", async () => {
      // Start a task
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
      const task = runner.start("sleep 60");
      const taskId = task.id;

      // Kill the process externally
      runner.kill(taskId, true);
      await runner.shutdown();

      // Create new runner - should detect orphaned task
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      const recovered = runner.get(taskId);
      expect(recovered).not.toBeNull();
      // Could be killed or orphaned depending on timing
      expect(["killed", "orphaned"]).toContain(recovered!.status);
    });
  });

  describe("cleanup()", () => {
    it("should delete old completed tasks", async () => {
      runner = new TaskRunner({
        dataDir: TEST_DATA_DIR,
        maxAge: 100, // 100ms max age
        cleanupInterval: 0, // Manual cleanup only
      });
      await runner.initialize();

      // Run a task
      await runner.run("echo old");

      // Wait for it to be "old"
      await new Promise((r) => setTimeout(r, 150));

      // Run cleanup
      const result = runner.cleanup();

      expect(result.deletedTasks).toBe(1);
      expect(runner.list()).toHaveLength(0);
    });

    it("should keep tasks under maxTasks limit", async () => {
      runner = new TaskRunner({
        dataDir: TEST_DATA_DIR,
        maxTasks: 2,
        cleanupInterval: 0,
      });
      await runner.initialize();

      // Run 5 tasks
      await runner.run("echo 1");
      await runner.run("echo 2");
      await runner.run("echo 3");
      await runner.run("echo 4");
      await runner.run("echo 5");

      // Run cleanup
      const result = runner.cleanup();

      expect(result.deletedTasks).toBe(3);
      expect(runner.list()).toHaveLength(2);
    });

    it("should clean orphan log files", async () => {
      runner = new TaskRunner({
        dataDir: TEST_DATA_DIR,
        cleanupInterval: 0,
      });
      await runner.initialize();

      // Create an orphan log file
      const logsDir = join(TEST_DATA_DIR, "logs");
      const orphanLogFile = join(logsDir, "orphan-id.log");
      require("fs").writeFileSync(orphanLogFile, "orphan content");

      // Run cleanup
      const result = runner.cleanup();

      expect(result.deletedLogs).toBeGreaterThanOrEqual(1);
      expect(existsSync(orphanLogFile)).toBe(false);
    });
  });

  describe("shutdown()", () => {
    it("should release lock on shutdown", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
      await runner.shutdown();

      // Should be able to create new instance
      const runner2 = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner2.initialize();

      expect(runner2.list()).toEqual([]);
      await runner2.shutdown();

      // Reset runner to avoid afterEach issues
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
    });

    it("should save state before shutdown", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      await runner.run("echo saved");
      await runner.shutdown();

      // Re-initialize and check
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      expect(runner.list()).toHaveLength(1);
    });

    it("should not kill running tasks (they are detached)", async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();

      const task = runner.start("sleep 60");
      const pid = task.pid;
      await runner.shutdown();

      // Process should still be alive
      let isAlive = false;
      try {
        process.kill(pid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }

      expect(isAlive).toBe(true);

      // Clean up - kill process directly
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Process group might already be dead
      }

      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
    });
  });

  describe("runningCount()", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should count running tasks", async () => {
      expect(runner.runningCount()).toBe(0);

      runner.start("sleep 10");
      expect(runner.runningCount()).toBe(1);

      runner.start("sleep 10");
      expect(runner.runningCount()).toBe(2);

      // Complete a task
      await runner.run("echo done");
      expect(runner.runningCount()).toBe(2);

      // Kill all running
      for (const task of runner.list(true)) {
        runner.kill(task.id, true);
      }
    });
  });

  describe("Environment Variables", () => {
    beforeEach(async () => {
      runner = new TaskRunner({ dataDir: TEST_DATA_DIR });
      await runner.initialize();
    });

    it("should pass custom environment variables", async () => {
      const result = await runner.run("echo $MY_VAR", {
        env: { MY_VAR: "custom-value" },
      });

      expect(result.output).toContain("custom-value");
    });

    it("should inherit process environment", async () => {
      const result = await runner.run("echo $HOME");
      expect(result.output).toContain(process.env.HOME);
    });
  });
});

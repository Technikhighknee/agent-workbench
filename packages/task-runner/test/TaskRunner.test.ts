import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TaskRunner } from "../src/TaskRunner.js";
import { TaskStore } from "../src/TaskStore.js";

describe("TaskRunner", () => {
  let runner: TaskRunner;

  beforeEach(() => {
    // Use in-memory SQLite for tests
    runner = new TaskRunner({ dbPath: ":memory:" });
  });

  afterEach(async () => {
    await runner.shutdown();
  });

  describe("spawn", () => {
    it("spawns a task and returns immediately", () => {
      const task = runner.spawn("echo hello");

      expect(task.id).toBeDefined();
      expect(task.command).toBe("echo hello");
      expect(task.status).toBe("running");
      expect(task.startedAt).toBeInstanceOf(Date);
    });

    it("throws for empty command", () => {
      expect(() => runner.spawn("")).toThrow("Command cannot be empty");
      expect(() => runner.spawn("   ")).toThrow("Command cannot be empty");
    });

    it("uses custom label if provided", () => {
      const task = runner.spawn("echo test", { label: "my task" });
      expect(task.label).toBe("my task");
    });

    it("sets cwd if provided", () => {
      const task = runner.spawn("pwd", { cwd: "/tmp" });
      expect(task.cwd).toBe("/tmp");
    });
  });

  describe("run", () => {
    it("runs a command and waits for completion", async () => {
      const result = await runner.run("echo hello");

      expect(result.task.status).toBe("done");
      expect(result.task.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it("captures stdout output", async () => {
      const result = await runner.run("echo hello");

      expect(result.task.output).toContain("hello");
    });

    it("captures stderr output", async () => {
      const result = await runner.run("echo error >&2");

      expect(result.task.output).toContain("error");
    });

    it("returns failed status for non-zero exit", async () => {
      const result = await runner.run("exit 1");

      expect(result.task.status).toBe("failed");
      expect(result.task.exitCode).toBe(1);
    });

    it("times out for long-running commands", async () => {
      const result = await runner.run("sleep 10", { timeout: 100 });

      expect(result.timedOut).toBe(true);
      expect(result.task.status).toBe("running");
    });
  });

  describe("get", () => {
    it("returns task by id", async () => {
      const spawned = runner.spawn("echo test");
      const task = runner.get(spawned.id);

      expect(task).not.toBeNull();
      expect(task?.id).toBe(spawned.id);
    });

    it("returns null for unknown id", () => {
      const task = runner.get("nonexistent");
      expect(task).toBeNull();
    });

    it("returns fresh output", async () => {
      await runner.run("echo hello");
      const tasks = runner.list();
      const task = runner.get(tasks[0].id);

      expect(task?.output).toContain("hello");
    });
  });

  describe("list", () => {
    it("returns all tasks", async () => {
      await runner.run("echo one");
      await runner.run("echo two");

      const tasks = runner.list();
      expect(tasks.length).toBe(2);
    });

    it("filters to running only", async () => {
      runner.spawn("sleep 10");
      await runner.run("echo done");

      const all = runner.list();
      const running = runner.list(true);

      expect(all.length).toBe(2);
      expect(running.length).toBe(1);
      expect(running[0].status).toBe("running");
    });

    it("returns tasks in reverse chronological order", async () => {
      await runner.run("echo first");
      await runner.run("echo second");

      const tasks = runner.list();
      expect(tasks[0].command).toBe("echo second");
      expect(tasks[1].command).toBe("echo first");
    });
  });

  describe("kill", () => {
    it("kills a running task", async () => {
      const task = runner.spawn("sleep 10");
      const killed = runner.kill(task.id);

      expect(killed).toBe(true);

      const updated = runner.get(task.id);
      expect(updated?.status).toBe("killed");
    });

    it("returns false for non-running task", async () => {
      const result = await runner.run("echo done");
      const killed = runner.kill(result.task.id);

      expect(killed).toBe(false);
    });

    it("returns false for unknown id", () => {
      const killed = runner.kill("nonexistent");
      expect(killed).toBe(false);
    });
  });

  describe("waitFor", () => {
    it("matches pattern in output", async () => {
      const task = runner.spawn("sh -c 'sleep 0.1 && echo ready'");
      const result = await runner.waitFor(task.id, {
        pattern: /ready/,
        timeout: 5000,
      });

      expect(result.matched).toBe(true);
    });

    it("times out if pattern not found", async () => {
      const task = runner.spawn("sleep 10");
      const result = await runner.waitFor(task.id, {
        pattern: /never/,
        timeout: 100,
      });

      expect(result.matched).toBe(false);
      expect(result.task.status).toBe("running");
    });

    it("returns early if task exits without match", async () => {
      const task = runner.spawn("echo hello");

      // Wait for task to exit
      await new Promise((r) => setTimeout(r, 100));

      const result = await runner.waitFor(task.id, {
        pattern: /never/,
        timeout: 5000,
      });

      expect(result.matched).toBe(false);
      expect(result.task.status).not.toBe("running");
    });
  });

  describe("delete", () => {
    it("deletes a task", async () => {
      const result = await runner.run("echo test");
      const deleted = runner.delete(result.task.id);

      expect(deleted).toBe(true);
      expect(runner.get(result.task.id)).toBeNull();
    });

    it("kills running task before delete", () => {
      const task = runner.spawn("sleep 10");
      const deleted = runner.delete(task.id);

      expect(deleted).toBe(true);
      expect(runner.get(task.id)).toBeNull();
    });

    it("returns false for unknown id", () => {
      const deleted = runner.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("persistence", () => {
    it("persists tasks across store instances", async () => {
      // Create a temp file path
      const dbPath = `/tmp/task-runner-test-${Date.now()}.db`;

      // Runner 1: create a task
      const runner1 = new TaskRunner({ dbPath });
      await runner1.run("echo persisted");
      await runner1.shutdown();

      // Runner 2: should see the task
      const runner2 = new TaskRunner({ dbPath });
      const tasks = runner2.list();
      await runner2.shutdown();

      expect(tasks.length).toBe(1);
      expect(tasks[0].command).toBe("echo persisted");

      // Cleanup
      const fs = await import("node:fs/promises");
      await fs.unlink(dbPath).catch(() => {});
    });

    it("marks running tasks as orphaned on restart", async () => {
      const dbPath = `/tmp/task-runner-test-orphan-${Date.now()}.db`;

      // Runner 1: start a "running" task (we'll fake it in DB)
      const store = new TaskStore(dbPath);
      store.save({
        id: "test-orphan",
        command: "sleep 999",
        label: null,
        cwd: null,
        status: "running",
        exitCode: null,
        startedAt: new Date(),
        endedAt: null,
        output: "",
        truncated: false,
      });
      store.close();

      // Runner 2: should mark it as orphaned
      const runner2 = new TaskRunner({ dbPath });
      const task = runner2.get("test-orphan");
      await runner2.shutdown();

      expect(task?.status).toBe("orphaned");

      // Cleanup
      const fs = await import("node:fs/promises");
      await fs.unlink(dbPath).catch(() => {});
    });
  });
});

describe("TaskStore", () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("saves and retrieves tasks", () => {
    const task = {
      id: "test-1",
      command: "echo test",
      label: "test task",
      cwd: "/tmp",
      status: "running" as const,
      exitCode: null,
      startedAt: new Date(),
      endedAt: null,
      output: "",
      truncated: false,
    };

    store.save(task);
    const retrieved = store.get("test-1");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.command).toBe("echo test");
    expect(retrieved?.label).toBe("test task");
  });

  it("appends output", () => {
    store.save({
      id: "test-output",
      command: "echo",
      label: null,
      cwd: null,
      status: "running",
      exitCode: null,
      startedAt: new Date(),
      endedAt: null,
      output: "",
      truncated: false,
    });

    store.appendOutput("test-output", "line 1\n", 1000);
    store.appendOutput("test-output", "line 2\n", 1000);

    const task = store.get("test-output");
    expect(task?.output).toBe("line 1\nline 2\n");
  });

  it("marks truncated when output exceeds max", () => {
    store.save({
      id: "test-truncate",
      command: "echo",
      label: null,
      cwd: null,
      status: "running",
      exitCode: null,
      startedAt: new Date(),
      endedAt: null,
      output: "",
      truncated: false,
    });

    // Append more than max (set max to 10 bytes)
    store.appendOutput("test-truncate", "12345678901234567890", 10);

    const task = store.get("test-truncate");
    expect(task?.truncated).toBe(true);
  });

  it("lists tasks in order", () => {
    const now = Date.now();

    store.save({
      id: "older",
      command: "echo older",
      label: null,
      cwd: null,
      status: "done",
      exitCode: 0,
      startedAt: new Date(now - 1000),
      endedAt: new Date(now - 900),
      output: "",
      truncated: false,
    });

    store.save({
      id: "newer",
      command: "echo newer",
      label: null,
      cwd: null,
      status: "done",
      exitCode: 0,
      startedAt: new Date(now),
      endedAt: new Date(now + 100),
      output: "",
      truncated: false,
    });

    const tasks = store.list();
    expect(tasks[0].id).toBe("newer");
    expect(tasks[1].id).toBe("older");
  });

  it("marks orphaned tasks", () => {
    store.save({
      id: "will-orphan",
      command: "sleep",
      label: null,
      cwd: null,
      status: "running",
      exitCode: null,
      startedAt: new Date(),
      endedAt: null,
      output: "",
      truncated: false,
    });

    const count = store.markOrphaned();
    expect(count).toBe(1);

    const task = store.get("will-orphan");
    expect(task?.status).toBe("orphaned");
    expect(task?.endedAt).not.toBeNull();
  });

  it("cleans up old tasks", () => {
    const old = new Date(Date.now() - 100_000);

    store.save({
      id: "old-task",
      command: "echo old",
      label: null,
      cwd: null,
      status: "done",
      exitCode: 0,
      startedAt: old,
      endedAt: old,
      output: "",
      truncated: false,
    });

    const deleted = store.cleanupOld(50_000); // Max age 50 seconds
    expect(deleted).toBe(1);
    expect(store.get("old-task")).toBeNull();
  });

  it("enforces max completed tasks", () => {
    // Create 5 completed tasks
    for (let i = 0; i < 5; i++) {
      store.save({
        id: `task-${i}`,
        command: `echo ${i}`,
        label: null,
        cwd: null,
        status: "done",
        exitCode: 0,
        startedAt: new Date(Date.now() + i * 1000), // Stagger times
        endedAt: new Date(Date.now() + i * 1000 + 100),
        output: "",
        truncated: false,
      });
    }

    // Enforce max of 3
    const deleted = store.enforceMaxCompleted(3);
    expect(deleted).toBe(2);

    // Should have kept the 3 newest
    const remaining = store.list();
    expect(remaining.length).toBe(3);
  });
});

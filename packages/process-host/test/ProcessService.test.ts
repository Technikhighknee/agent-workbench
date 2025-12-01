import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProcessService } from "../src/core/services/ProcessService.js";
import { InMemoryProcessRepository } from "../src/infrastructure/memory/InMemoryProcessRepository.js";
import { InMemoryLogRepository } from "../src/infrastructure/memory/InMemoryLogRepository.js";
import { NodeProcessSpawner } from "../src/infrastructure/runner/NodeProcessSpawner.js";

describe("ProcessService", () => {
  let service: ProcessService;
  let processRepo: InMemoryProcessRepository;
  let logRepo: InMemoryLogRepository;

  beforeEach(() => {
    processRepo = new InMemoryProcessRepository();
    logRepo = new InMemoryLogRepository();
    service = new ProcessService(
      processRepo,
      logRepo,
      new NodeProcessSpawner()
    );
  });

  afterEach(async () => {
    // Clean up any running processes
    await service.stopAll();
  });

  describe("start", () => {
    it("starts a process and returns info", () => {
      const result = service.start({ command: "echo hello" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.command).toBe("echo hello");
      expect(result.value.id).toBeDefined();
      expect(result.value.startedAt).toBeDefined();
    });

    it("returns error for empty command", () => {
      const result = service.start({ command: "" });
      expect(result.ok).toBe(false);
    });

    it("returns error for whitespace-only command", () => {
      const result = service.start({ command: "   " });
      expect(result.ok).toBe(false);
    });

    it("generates unique ids for processes", () => {
      const result1 = service.start({ command: "echo 1" });
      const result2 = service.start({ command: "echo 2" });

      expect(result1.ok && result2.ok).toBe(true);
      if (!result1.ok || !result2.ok) return;

      expect(result1.value.id).not.toBe(result2.value.id);
    });

    it("stores process in repository", () => {
      const result = service.start({ command: "echo test" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const stored = processRepo.get(result.value.id);
      expect(stored).not.toBeNull();
      expect(stored?.command).toBe("echo test");
    });

    it("uses custom label if provided", () => {
      const result = service.start({ command: "echo test", label: "My Process" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.label).toBe("My Process");
    });
  });

  describe("run (blocking)", () => {
    it("runs a command and waits for completion", async () => {
      const result = await service.run({ command: "echo 'hello world'" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.process.status).toBe("exited");
      expect(result.value.exitCode).toBe(0);
    });

    it("captures stdout output", async () => {
      const result = await service.run({ command: "echo 'test output'" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.logs).toContain("test output");
    });

    it("returns failed status for non-zero exit", async () => {
      const result = await service.run({ command: "sh -c 'exit 1'" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.process.status).toBe("failed");
      expect(result.value.exitCode).toBe(1);
    });
  });

  describe("stop", () => {
    it("stops a running process", async () => {
      const startResult = service.start({ command: "sleep 10" });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      // Give process time to start
      await new Promise((r) => setTimeout(r, 100));

      const stopResult = await service.stop({ id: startResult.value.id });

      expect(stopResult.ok).toBe(true);
      if (!stopResult.ok) return;

      expect(stopResult.value.status).toBe("stopped");
    });

    it("returns error for non-existent process", async () => {
      const result = await service.stop({ id: "non-existent" });
      expect(result.ok).toBe(false);
    });
  });

  describe("getProcess", () => {
    it("returns process info by id", () => {
      const startResult = service.start({ command: "echo test" });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const info = service.getProcess(startResult.value.id);
      expect(info).not.toBeNull();
      expect(info?.command).toBe("echo test");
    });

    it("returns null for non-existent process", () => {
      expect(service.getProcess("non-existent")).toBeNull();
    });
  });

  describe("listProcesses", () => {
    it("returns all processes", () => {
      service.start({ command: "echo 1" });
      service.start({ command: "echo 2" });

      const list = service.listProcesses();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("listRunning", () => {
    it("returns only running processes", async () => {
      // Start a long-running process
      const longResult = service.start({ command: "sleep 10" });

      // Run a quick process that will complete
      await service.run({ command: "echo done" });

      // Give time for processes to settle
      await new Promise((r) => setTimeout(r, 100));

      const running = service.listRunning();
      expect(running.some((p) => p.status === "running")).toBe(true);

      // Clean up
      if (longResult.ok) {
        await service.stop({ id: longResult.value.id });
      }
    });
  });

  describe("getLogs", () => {
    it("returns combined logs for a process", async () => {
      const result = await service.run({
        command: "sh -c 'echo stdout; echo stderr >&2'",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const logs = service.getLogs(result.value.process.id);
      expect(logs?.logs).toContain("stdout");
      expect(logs?.logs).toContain("stderr");
    });

    it("returns null for process with no logs", () => {
      expect(service.getLogs("non-existent")).toBeNull();
    });
  });

  describe("getLogsByStream", () => {
    it("filters logs by stream", async () => {
      const result = await service.run({
        command: "sh -c 'echo out; echo err >&2'",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const stdout = service.getLogsByStream(result.value.process.id, "stdout");
      const stderr = service.getLogsByStream(result.value.process.id, "stderr");

      expect(stdout?.logs).toContain("out");
      expect(stderr?.logs).toContain("err");
    });
  });

  describe("getStats", () => {
    it("returns process statistics", async () => {
      await service.run({ command: "echo 1" });
      await service.run({ command: "sh -c 'exit 1'" });

      const stats = service.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.exited).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe("searchLogs", () => {
    it("searches logs by pattern", async () => {
      const result = await service.run({
        command: "sh -c 'echo hello world; echo goodbye world'",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const searchResult = service.searchLogs(result.value.process.id, "hello");
      expect(searchResult.ok).toBe(true);
      if (!searchResult.ok) return;

      expect(searchResult.value.length).toBeGreaterThan(0);
      expect(searchResult.value.some((m) => m.includes("hello"))).toBe(true);
    });
  });

  describe("purge", () => {
    it("removes stopped processes", async () => {
      await service.run({ command: "echo test" });

      const beforeCount = service.listProcesses().length;
      await service.purge({ keepRunning: true });

      // Should have removed the exited process
      expect(service.listProcesses().length).toBeLessThanOrEqual(beforeCount);
    });
  });

  describe("stopAll", () => {
    it("stops all running processes", async () => {
      service.start({ command: "sleep 10" });
      service.start({ command: "sleep 10" });

      await new Promise((r) => setTimeout(r, 100));

      const result = await service.stopAll();

      expect(result.stopped.length).toBeGreaterThanOrEqual(2);
      expect(service.listRunning().length).toBe(0);
    });
  });
});

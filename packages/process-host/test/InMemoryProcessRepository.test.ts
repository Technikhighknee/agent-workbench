import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryProcessRepository } from "../src/infrastructure/memory/InMemoryProcessRepository.js";
import { ProcessInfo } from "../src/core/model.js";

describe("InMemoryProcessRepository", () => {
  let repo: InMemoryProcessRepository;

  beforeEach(() => {
    repo = new InMemoryProcessRepository();
  });

  const createProcess = (id: string, overrides?: Partial<ProcessInfo>): ProcessInfo => ({
    id,
    command: "echo",
    args: ["hello"],
    status: "running",
    pid: 1234,
    startedAt: new Date().toISOString(),
    ...overrides,
  });

  describe("save", () => {
    it("stores a process", () => {
      const process = createProcess("test-1");
      repo.save(process);

      const retrieved = repo.get("test-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("test-1");
      expect(retrieved?.command).toBe("echo");
    });

    it("creates a copy of the process", () => {
      const process = createProcess("test-1");
      repo.save(process);

      // Modify original
      process.status = "exited";

      // Retrieved should still have original value
      const retrieved = repo.get("test-1");
      expect(retrieved?.status).toBe("running");
    });
  });

  describe("get", () => {
    it("returns null for non-existent process", () => {
      expect(repo.get("non-existent")).toBeNull();
    });

    it("returns a copy of the process", () => {
      repo.save(createProcess("test-1"));

      const retrieved1 = repo.get("test-1");
      const retrieved2 = repo.get("test-1");

      expect(retrieved1).not.toBe(retrieved2);
      expect(retrieved1).toEqual(retrieved2);
    });
  });

  describe("updateStatus", () => {
    it("updates process status", () => {
      repo.save(createProcess("test-1"));
      repo.updateStatus("test-1", "exited");

      expect(repo.get("test-1")?.status).toBe("exited");
    });

    it("sets endedAt when provided", () => {
      repo.save(createProcess("test-1"));
      const endTime = new Date().toISOString();
      repo.updateStatus("test-1", "exited", endTime);

      expect(repo.get("test-1")?.endedAt).toBe(endTime);
    });

    it("handles non-existent process gracefully", () => {
      // Should not throw
      repo.updateStatus("non-existent", "exited");
    });
  });

  describe("updatePid", () => {
    it("updates process pid", () => {
      repo.save(createProcess("test-1", { pid: null }));
      repo.updatePid("test-1", 5678);

      expect(repo.get("test-1")?.pid).toBe(5678);
    });

    it("can set pid to null", () => {
      repo.save(createProcess("test-1", { pid: 1234 }));
      repo.updatePid("test-1", null);

      expect(repo.get("test-1")?.pid).toBeNull();
    });
  });

  describe("updateExitCode", () => {
    it("updates process exit code", () => {
      repo.save(createProcess("test-1"));
      repo.updateExitCode("test-1", 0);

      expect(repo.get("test-1")?.exitCode).toBe(0);
    });

    it("handles non-zero exit codes", () => {
      repo.save(createProcess("test-1"));
      repo.updateExitCode("test-1", 1);

      expect(repo.get("test-1")?.exitCode).toBe(1);
    });
  });

  describe("list", () => {
    it("returns empty array when no processes", () => {
      expect(repo.list()).toEqual([]);
    });

    it("returns all processes", () => {
      repo.save(createProcess("test-1"));
      repo.save(createProcess("test-2"));
      repo.save(createProcess("test-3"));

      expect(repo.list()).toHaveLength(3);
    });

    it("sorts by startedAt descending (newest first)", () => {
      repo.save(createProcess("old", { startedAt: "2024-01-01T00:00:00Z" }));
      repo.save(createProcess("new", { startedAt: "2024-12-01T00:00:00Z" }));
      repo.save(createProcess("mid", { startedAt: "2024-06-01T00:00:00Z" }));

      const list = repo.list();
      expect(list[0].id).toBe("new");
      expect(list[1].id).toBe("mid");
      expect(list[2].id).toBe("old");
    });
  });

  describe("listByStatus", () => {
    it("filters by status", () => {
      repo.save(createProcess("running-1", { status: "running" }));
      repo.save(createProcess("running-2", { status: "running" }));
      repo.save(createProcess("exited-1", { status: "exited" }));
      repo.save(createProcess("failed-1", { status: "failed" }));

      const running = repo.listByStatus("running");
      expect(running).toHaveLength(2);
      expect(running.every((p) => p.status === "running")).toBe(true);
    });

    it("returns empty array when no matches", () => {
      repo.save(createProcess("running-1", { status: "running" }));

      expect(repo.listByStatus("exited")).toHaveLength(0);
    });
  });

  describe("delete", () => {
    it("removes a process", () => {
      repo.save(createProcess("test-1"));
      repo.delete("test-1");

      expect(repo.get("test-1")).toBeNull();
    });

    it("handles non-existent process gracefully", () => {
      // Should not throw
      repo.delete("non-existent");
    });
  });

  describe("clear", () => {
    it("removes all processes", () => {
      repo.save(createProcess("test-1"));
      repo.save(createProcess("test-2"));
      repo.clear();

      expect(repo.list()).toHaveLength(0);
    });
  });
});

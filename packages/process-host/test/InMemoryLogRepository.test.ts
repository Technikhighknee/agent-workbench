import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryLogRepository } from "../src/infrastructure/memory/InMemoryLogRepository.js";

describe("InMemoryLogRepository", () => {
  let repo: InMemoryLogRepository;

  beforeEach(() => {
    repo = new InMemoryLogRepository();
  });

  describe("append", () => {
    it("adds log entry for a session", () => {
      repo.append("session-1", "stdout", "Hello world\n");

      const logs = repo.get("session-1");
      expect(logs).not.toBeNull();
      expect(logs?.logs).toBe("Hello world\n");
    });

    it("appends multiple entries", () => {
      repo.append("session-1", "stdout", "Line 1\n");
      repo.append("session-1", "stdout", "Line 2\n");

      const logs = repo.get("session-1");
      expect(logs?.logs).toBe("Line 1\nLine 2\n");
    });

    it("handles both stdout and stderr", () => {
      repo.append("session-1", "stdout", "out\n");
      repo.append("session-1", "stderr", "err\n");

      const logs = repo.get("session-1");
      expect(logs?.logs).toBe("out\nerr\n");
    });
  });

  describe("get", () => {
    it("returns null for non-existent session", () => {
      expect(repo.get("non-existent")).toBeNull();
    });

    it("returns logs with session id", () => {
      repo.append("session-1", "stdout", "test");

      const logs = repo.get("session-1");
      expect(logs?.sessionId).toBe("session-1");
    });

    it("respects lastLines limit", () => {
      for (let i = 1; i <= 10; i++) {
        repo.append("session-1", "stdout", `Line ${i}\n`);
      }

      const logs = repo.get("session-1", 3);
      expect(logs?.logs).toBe("Line 8\nLine 9\nLine 10\n");
    });
  });

  describe("getByStream", () => {
    it("filters by stdout only", () => {
      repo.append("session-1", "stdout", "out1\n");
      repo.append("session-1", "stderr", "err1\n");
      repo.append("session-1", "stdout", "out2\n");

      const logs = repo.getByStream("session-1", "stdout");
      expect(logs?.logs).toBe("out1\nout2\n");
    });

    it("filters by stderr only", () => {
      repo.append("session-1", "stdout", "out1\n");
      repo.append("session-1", "stderr", "err1\n");
      repo.append("session-1", "stderr", "err2\n");

      const logs = repo.getByStream("session-1", "stderr");
      expect(logs?.logs).toBe("err1\nerr2\n");
    });

    it("returns null when stream has no entries", () => {
      repo.append("session-1", "stdout", "out\n");

      expect(repo.getByStream("session-1", "stderr")).toBeNull();
    });

    it("returns null for non-existent session", () => {
      expect(repo.getByStream("non-existent", "stdout")).toBeNull();
    });
  });

  describe("getEntries", () => {
    it("returns structured log entries", () => {
      repo.append("session-1", "stdout", "test");

      const entries = repo.getEntries("session-1");
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("session-1");
      expect(entries[0].stream).toBe("stdout");
      expect(entries[0].chunk).toBe("test");
      expect(entries[0].timestamp).toBeDefined();
    });

    it("returns empty array for non-existent session", () => {
      expect(repo.getEntries("non-existent")).toEqual([]);
    });

    it("respects lastEntries limit", () => {
      for (let i = 1; i <= 10; i++) {
        repo.append("session-1", "stdout", `${i}`);
      }

      const entries = repo.getEntries("session-1", 3);
      expect(entries).toHaveLength(3);
      expect(entries[0].chunk).toBe("8");
      expect(entries[1].chunk).toBe("9");
      expect(entries[2].chunk).toBe("10");
    });
  });

  describe("delete", () => {
    it("removes logs for a session", () => {
      repo.append("session-1", "stdout", "test");
      repo.delete("session-1");

      expect(repo.get("session-1")).toBeNull();
    });

    it("handles non-existent session gracefully", () => {
      // Should not throw
      repo.delete("non-existent");
    });
  });

  describe("clear", () => {
    it("removes all logs", () => {
      repo.append("session-1", "stdout", "test1");
      repo.append("session-2", "stdout", "test2");
      repo.clear();

      expect(repo.get("session-1")).toBeNull();
      expect(repo.get("session-2")).toBeNull();
    });
  });

  describe("max chunks limit", () => {
    it("limits stored entries per session", () => {
      const limitedRepo = new InMemoryLogRepository(5);

      for (let i = 1; i <= 10; i++) {
        limitedRepo.append("session-1", "stdout", `${i}\n`);
      }

      const logs = limitedRepo.get("session-1", 100);
      // Should only have last 5 entries
      expect(logs?.logs).toBe("6\n7\n8\n9\n10\n");
    });
  });
});

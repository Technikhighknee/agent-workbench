import { describe, it, expect, beforeAll } from "vitest";
import { GitService } from "../src/core/GitService.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use the monorepo root as our test repo
const REPO_ROOT = join(__dirname, "..", "..", "..");

describe("GitService", () => {
  let service: GitService;

  beforeAll(() => {
    service = new GitService(REPO_ROOT);
  });

  describe("isGitRepo", () => {
    it("returns true for a git repository", async () => {
      const result = await service.isGitRepo();
      expect(result).toBe(true);
    });

    it("returns false for non-repo directory", async () => {
      const nonRepoService = new GitService("/tmp");
      const result = await nonRepoService.isGitRepo();
      expect(result).toBe(false);
    });
  });

  describe("blame", () => {
    it("returns blame information for a file", async () => {
      const result = await service.blame("package.json");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.filePath).toBe("package.json");
      expect(result.value.lines.length).toBeGreaterThan(0);

      const firstLine = result.value.lines[0];
      expect(firstLine.line).toBe(1);
      expect(firstLine.commit).toBeDefined();
      expect(firstLine.author).toBeDefined();
      expect(firstLine.content).toBeDefined();
    });

    it("returns error for non-existent file", async () => {
      const result = await service.blame("non-existent-file.txt");
      expect(result.ok).toBe(false);
    });
  });

  describe("fileHistory", () => {
    it("returns commit history for a file", async () => {
      const result = await service.fileHistory("package.json", 5);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.length).toBeLessThanOrEqual(5);

      const commit = result.value[0];
      expect(commit.hash).toBeDefined();
      expect(commit.shortHash).toBeDefined();
      expect(commit.author).toBeDefined();
      expect(commit.message).toBeDefined();
    });

    it("returns empty array for non-existent file", async () => {
      const result = await service.fileHistory("non-existent-file.txt", 5);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });
  });

  describe("recentChanges", () => {
    it("returns recent commits and changes", async () => {
      const result = await service.recentChanges(5);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.commits.length).toBeGreaterThan(0);
      expect(result.value.commits.length).toBeLessThanOrEqual(5);
      expect(result.value.filesChanged).toBeDefined();
      expect(typeof result.value.totalAdditions).toBe("number");
      expect(typeof result.value.totalDeletions).toBe("number");
    });
  });

  describe("commitInfo", () => {
    it("returns information about HEAD commit", async () => {
      const result = await service.commitInfo("HEAD");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.hash).toBeDefined();
      expect(result.value.shortHash).toHaveLength(7);
      expect(result.value.author).toBeDefined();
      expect(result.value.email).toBeDefined();
      expect(result.value.date).toBeDefined();
      expect(result.value.message).toBeDefined();
      expect(result.value.subject).toBeDefined();
    });

    it("returns error for invalid ref", async () => {
      const result = await service.commitInfo("invalid-ref-that-does-not-exist");
      expect(result.ok).toBe(false);
    });
  });

  describe("searchCommits", () => {
    it("searches commits by message", async () => {
      // Search for a common word that's likely in commit messages
      const result = await service.searchCommits("fix", 10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should find at least some commits (or none if no "fix" commits)
      expect(Array.isArray(result.value)).toBe(true);
    });
  });

  describe("diffFile", () => {
    it("returns diff between HEAD~1 and HEAD for a recently changed file", async () => {
      // First get recent changes to find a file that was modified
      const recentResult = await service.recentChanges(1);
      if (!recentResult.ok || recentResult.value.filesChanged.length === 0) {
        // Skip if no recent changes
        return;
      }

      const changedFile = recentResult.value.filesChanged[0];
      const result = await service.diffFile(changedFile, "HEAD~1", "HEAD");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(typeof result.value).toBe("string");
    });
  });

  describe("branchDiff", () => {
    it("returns diff summary for current branch vs main", async () => {
      const result = await service.branchDiff("main", "HEAD");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.base).toBe("main");
      expect(result.value.head).toBe("HEAD");
      expect(typeof result.value.commitsAhead).toBe("number");
      expect(typeof result.value.commitsBehind).toBe("number");
      expect(Array.isArray(result.value.files)).toBe(true);
      expect(typeof result.value.totalAdditions).toBe("number");
      expect(typeof result.value.totalDeletions).toBe("number");
    });
  });

  describe("edge cases", () => {
    it("handles files with spaces in path", async () => {
      // This tests that the service properly escapes paths
      const result = await service.blame("file with spaces.txt");
      // Should return error since file doesn't exist, not crash
      expect(result.ok).toBe(false);
    });
  });
});

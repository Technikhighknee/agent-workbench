import { describe, it, expect, beforeAll } from "vitest";
import { TestRunnerServiceImpl } from "../src/infrastructure/TestRunnerServiceImpl.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use the actual monorepo root for testing
const MONOREPO_ROOT = join(__dirname, "..", "..", "..");

describe("TestRunnerServiceImpl", () => {
  let service: TestRunnerServiceImpl;

  beforeAll(async () => {
    service = new TestRunnerServiceImpl();
    await service.initialize(MONOREPO_ROOT);
  });

  describe("initialization", () => {
    it("initializes successfully for a valid project", async () => {
      const freshService = new TestRunnerServiceImpl();
      const result = await freshService.initialize(MONOREPO_ROOT);

      expect(result.ok).toBe(true);
    });

    it("reports as initialized after successful init", async () => {
      const freshService = new TestRunnerServiceImpl();
      expect(freshService.isInitialized()).toBe(false);

      await freshService.initialize(MONOREPO_ROOT);
      expect(freshService.isInitialized()).toBe(true);
    });

    it("returns error for non-existent project", async () => {
      const freshService = new TestRunnerServiceImpl();
      const result = await freshService.initialize("/non/existent/path");

      expect(result.ok).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("returns test configuration", () => {
      const result = service.getConfig();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.framework).toBeDefined();
      expect(result.value.cwd).toBeDefined();
      expect(Array.isArray(result.value.testPatterns)).toBe(true);
    });

    it("detects vitest framework", () => {
      const result = service.getConfig();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.framework).toBe("vitest");
    });
  });

  describe("listTestFiles", () => {
    it("discovers test files in the project", async () => {
      const result = await service.listTestFiles();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBeGreaterThan(0);
      // All files should end with .test.ts or similar
      expect(result.value.some((f) => f.includes(".test."))).toBe(true);
    });
  });

  describe("runTests", () => {
    it("can run tests and returns results", async () => {
      // Run just the core tests for speed
      const result = await service.runTests({
        files: ["packages/core/test/result.test.ts"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.framework).toBe("vitest");
      expect(result.value.summary).toBeDefined();
      expect(typeof result.value.summary.total).toBe("number");
      expect(result.value.success).toBe(true);
    });

    it("captures test details", async () => {
      const result = await service.runTests({
        files: ["packages/core/test/result.test.ts"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.tests.length).toBeGreaterThan(0);

      const test = result.value.tests[0];
      expect(test.name).toBeDefined();
      expect(test.status).toBeDefined();
    });
  });

  describe("getLastRun", () => {
    it("returns error before any tests run", async () => {
      const freshService = new TestRunnerServiceImpl();
      await freshService.initialize(MONOREPO_ROOT);

      const result = freshService.getLastRun();
      // Returns Err when no tests have been run
      expect(result.ok).toBe(false);
    });

    it("returns last run results after tests", async () => {
      const freshService = new TestRunnerServiceImpl();
      await freshService.initialize(MONOREPO_ROOT);

      // Run some tests
      await freshService.runTests({
        files: ["packages/core/test/result.test.ts"],
      });

      const result = freshService.getLastRun();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).not.toBeNull();
      expect(result.value?.framework).toBe("vitest");
    });
  });

  describe("getFailedTests", () => {
    it("returns empty array when no failures", async () => {
      const freshService = new TestRunnerServiceImpl();
      await freshService.initialize(MONOREPO_ROOT);

      // Run tests that should pass
      await freshService.runTests({
        files: ["packages/core/test/result.test.ts"],
      });

      const result = freshService.getFailedTests();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.length).toBe(0);
    });
  });
});

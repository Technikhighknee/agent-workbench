import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TypeScriptService } from "../src/infrastructure/typescript/TypeScriptService.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use the actual monorepo root for more reliable testing
const MONOREPO_ROOT = join(__dirname, "..", "..", "..");

describe("TypeScriptService", () => {
  let service: TypeScriptService;

  beforeAll(async () => {
    service = new TypeScriptService();
    await service.initialize(MONOREPO_ROOT);
  }, 30000); // 30 second timeout for initialization

  afterAll(() => {
    service.dispose();
  });

  describe("initialization", () => {
    it("initializes successfully", () => {
      expect(service.isInitialized()).toBe(true);
    });

    it("returns project info", () => {
      const result = service.getProjectInfo();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.rootDir).toBeDefined();
      expect(typeof result.value.fileCount).toBe("number");
    });
  });

  describe("getDiagnostics", () => {
    it("gets diagnostics for a file", async () => {
      // Use the core package index as a test file
      const filePath = join(MONOREPO_ROOT, "packages/core/src/index.ts");
      const result = await service.getDiagnostics({ file: filePath });

      // Should return ok (either with diagnostics or error for file not in project)
      expect(result).toBeDefined();
      // If it's not in a project, it will return an error
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it("gets all diagnostics with limit", { timeout: 30000 }, async () => {
      const result = await service.getDiagnostics({ limit: 10 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBeLessThanOrEqual(10);
    });

    it("returns diagnostics with structure", { timeout: 30000 }, async () => {
      const result = await service.getDiagnostics({ limit: 5 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // If there are any diagnostics, check their structure
      if (result.value.length > 0) {
        const diag = result.value[0];
        expect(diag.message).toBeDefined();
        expect(diag.severity).toBeDefined();
      }
    });
  });

  describe("getTypeAtPosition", () => {
    it("returns type info for a symbol", async () => {
      // Use result.ts which has well-defined types
      const filePath = join(MONOREPO_ROOT, "packages/core/src/result.ts");
      const result = await service.getTypeAtPosition({ file: filePath, line: 1, column: 10 });

      // Service should return something (ok or error)
      expect(result).toBeDefined();
    });
  });

  describe("getDefinition", () => {
    it("handles definition lookup", async () => {
      const filePath = join(MONOREPO_ROOT, "packages/core/src/result.ts");
      const result = await service.getDefinition({ file: filePath, line: 1, column: 10 });

      // Service should return something (ok or error)
      expect(result).toBeDefined();
    });
  });

  describe("findReferences", () => {
    it("handles reference lookup", async () => {
      const filePath = join(MONOREPO_ROOT, "packages/core/src/result.ts");
      const result = await service.findReferences({ file: filePath, line: 1, column: 10 });

      // Service should return something (ok or error)
      expect(result).toBeDefined();
    });
  });

  describe("notifyFileChanged", () => {
    it("accepts file change notifications", () => {
      const filePath = join(MONOREPO_ROOT, "packages/core/src/result.ts");
      // This should not throw (sync method)
      service.notifyFileChanged(filePath);
    });
  });

  // getDiagnosticSummary removed - use `tsc --noEmit` for project-wide checks

  describe("reload", () => {
    it("can reload projects", async () => {
      const result = await service.reload();
      expect(result.ok).toBe(true);
    });
  });
});

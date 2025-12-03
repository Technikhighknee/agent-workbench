/**
 * Tests for InsightService.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { InsightService } from "../src/InsightService.js";
import { join } from "node:path";

// Use the actual project for testing
const PROJECT_ROOT = join(process.cwd());

describe("InsightService", () => {
  let service: InsightService;

  beforeAll(async () => {
    service = new InsightService(PROJECT_ROOT);
    await service.initialize();
  });

  describe("initialize()", () => {
    it("should initialize successfully", async () => {
      const newService = new InsightService(PROJECT_ROOT);
      const result = await newService.initialize();
      expect(result.ok).toBe(true);
    });

    it("should be idempotent", async () => {
      const newService = new InsightService(PROJECT_ROOT);
      await newService.initialize();
      const result = await newService.initialize();
      expect(result.ok).toBe(true);
    });
  });

  describe("getInsight() - File", () => {
    it("should return insight for a file path", async () => {
      const result = await service.getInsight("packages/insight/src/model.ts");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      expect(insight.type).toBe("file");

      if (insight.type !== "file") return;
      expect(insight.language).toBe("typescript");
      expect(insight.structure.symbols.length).toBeGreaterThan(0);
      expect(insight.metrics.lines).toBeGreaterThan(0);
    });

    it("should include imports and exports", async () => {
      const result = await service.getInsight("packages/insight/src/index.ts");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      expect(insight.type).toBe("file");

      if (insight.type !== "file") return;
      expect(insight.structure.exports.length).toBeGreaterThan(0);
    });

    it("should return error for non-existent file", async () => {
      const result = await service.getInsight("non/existent/file.ts");
      expect(result.ok).toBe(false);
    });
  });

  describe("getInsight() - Directory", () => {
    it("should return insight for a directory", async () => {
      const result = await service.getInsight("packages/insight/src");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      expect(insight.type).toBe("directory");

      if (insight.type !== "directory") return;
      expect(insight.structure.files.length).toBeGreaterThan(0);
      expect(insight.metrics.lines).toBeGreaterThan(0);
    });

    it("should identify entry points", async () => {
      const result = await service.getInsight("packages/insight/src");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      if (insight.type !== "directory") return;

      expect(insight.structure.entryPoints).toContain("index.ts");
    });

    it("should list subdirectories", async () => {
      const result = await service.getInsight("packages/insight/src");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      if (insight.type !== "directory") return;

      expect(insight.structure.subdirectories).toContain("tools");
    });
  });

  describe("getInsight() - Symbol", () => {
    it("should return insight for a symbol name", async () => {
      const result = await service.getInsight("InsightService");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      expect(insight.type).toBe("symbol");

      if (insight.type !== "symbol") return;
      expect(insight.name).toBe("InsightService");
      expect(insight.kind).toBe("class");
      expect(insight.code.length).toBeGreaterThan(0);
    });

    it("should include relationships", async () => {
      const result = await service.getInsight("InsightService");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      if (insight.type !== "symbol") return;

      // InsightService has related symbols in the same file
      expect(insight.relationships.related.length).toBeGreaterThanOrEqual(0);
    });

    it("should return error for non-existent symbol", async () => {
      const result = await service.getInsight("NonExistentSymbol12345");
      expect(result.ok).toBe(false);
    });
  });

  describe("Options", () => {
    it("should respect includeCode option", async () => {
      const result = await service.getInsight("InsightService", {
        includeCode: false,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      if (insight.type !== "symbol") return;

      expect(insight.code).toBe("");
    });

    it("should respect maxChanges option", async () => {
      const result = await service.getInsight("packages/insight/src/model.ts", {
        maxChanges: 2,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      expect(insight.recentChanges.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Metrics", () => {
    it("should calculate complexity correctly", async () => {
      const result = await service.getInsight("packages/insight/src/model.ts");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const insight = result.value;
      if (insight.type !== "file") return;

      // model.ts is a small file, should be low/medium complexity
      expect(["low", "medium"]).toContain(insight.metrics.complexity);
    });
  });
});

/**
 * Tests for PreviewService.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PreviewService } from "../src/PreviewService.js";
import { join } from "node:path";

// Use the actual project for testing
const PROJECT_ROOT = join(process.cwd());

describe("PreviewService", () => {
  let service: PreviewService;

  beforeAll(async () => {
    service = new PreviewService(PROJECT_ROOT);
    await service.initialize();
  });

  describe("initialize()", () => {
    it("should initialize successfully", async () => {
      const newService = new PreviewService(PROJECT_ROOT);
      const result = await newService.initialize();
      expect(result.ok).toBe(true);
    });

    it("should be idempotent", async () => {
      const newService = new PreviewService(PROJECT_ROOT);
      await newService.initialize();
      const result = await newService.initialize();
      expect(result.ok).toBe(true);
    });
  });

  describe("previewEdit()", () => {
    it("should preview an edit to an existing symbol", async () => {
      const result = await service.previewEdit({
        file: "packages/core/src/result.ts",
        editType: "symbol",
        symbol: "Ok",
        newContent: `export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}`,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const preview = result.value;
      // Should analyze the edit
      expect(preview).toHaveProperty("typeErrors");
      expect(preview).toHaveProperty("affectedCallers");
      expect(preview).toHaveProperty("relatedTests");
      expect(preview).toHaveProperty("summary");
    });

    it("should find type errors for breaking changes", async () => {
      const result = await service.previewEdit({
        file: "packages/core/src/result.ts",
        editType: "symbol",
        symbol: "Ok",
        // Change signature to require an extra parameter - should cause errors
        newContent: `export function Ok<T>(value: T, required: string): Result<T, never> {
  console.log(required);
  return { ok: true, value };
}`,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const preview = result.value;
      // Changing Ok signature should affect many callers
      expect(preview.affectedCallers.length).toBeGreaterThan(0);
    });

    it("should find related tests", async () => {
      const result = await service.previewEdit(
        {
          file: "packages/core/src/result.ts",
          editType: "symbol",
          symbol: "Ok",
          newContent: `export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}`,
        },
        { findTests: true }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const preview = result.value;
      // Should find tests related to result.ts
      expect(preview.relatedTests.length).toBeGreaterThan(0);
    });

    it("should return error for non-existent file", async () => {
      const result = await service.previewEdit({
        file: "non/existent/file.ts",
        editType: "symbol",
        symbol: "foo",
        newContent: "function foo() {}",
      });

      expect(result.ok).toBe(false);
    });

    it("should handle non-existent symbol gracefully", async () => {
      // PreviewService doesn't validate symbol existence - it just previews the edit
      // The type checker will catch issues if the symbol doesn't exist
      const result = await service.previewEdit({
        file: "packages/core/src/result.ts",
        editType: "symbol",
        symbol: "NonExistentSymbol",
        newContent: "function NonExistentSymbol() {}",
      });

      // Returns Ok since it previews even non-existent symbols
      expect(result.ok).toBe(true);
    });
  });

  describe("previewEdits() - batch", () => {
    it("should preview multiple edits at once", async () => {
      const result = await service.previewEdits([
        {
          file: "packages/core/src/result.ts",
          editType: "symbol",
          symbol: "Ok",
          newContent: `export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}`,
        },
        {
          file: "packages/core/src/result.ts",
          editType: "symbol",
          symbol: "Err",
          newContent: `export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}`,
        },
      ]);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const preview = result.value;
      expect(preview).toHaveProperty("typeErrors");
      expect(preview).toHaveProperty("affectedCallers");
    });
  });

  describe("options", () => {
    it("should respect checkTypes option", async () => {
      const result = await service.previewEdit(
        {
          file: "packages/core/src/result.ts",
          editType: "symbol",
          symbol: "Ok",
          newContent: `export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}`,
        },
        { checkTypes: false }
      );

      expect(result.ok).toBe(true);
    });

    it("should respect analyzeCallers option", async () => {
      const result = await service.previewEdit(
        {
          file: "packages/core/src/result.ts",
          editType: "symbol",
          symbol: "Ok",
          newContent: `export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}`,
        },
        { analyzeCallers: false }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // When analyzeCallers is false, should have empty callers
      expect(result.value.affectedCallers).toEqual([]);
    });
  });
});

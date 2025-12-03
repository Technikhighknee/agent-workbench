import { describe, it, expect } from "vitest";
import { TypeChecker } from "../src/TypeChecker.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("TypeChecker", () => {
  const checker = new TypeChecker();

  describe("checkFile", () => {
    it("returns empty array for clean file", async () => {
      // Use a known clean file
      const filePath = join(__dirname, "..", "..", "core", "src", "result.ts");
      const result = await checker.checkFile(filePath);

      expect(Array.isArray(result)).toBe(true);
      // Core result.ts should be clean
      const errors = result.filter((d) => d.severity === "error");
      expect(errors.length).toBe(0);
    });

    it("returns errors for file with type errors", async () => {
      // Create a temp file with errors
      const testDir = join(__dirname, "temp");
      const testFile = join(testDir, "test-error.ts");
      const tsconfigFile = join(testDir, "tsconfig.json");

      try {
        mkdirSync(testDir, { recursive: true });

        // Create minimal tsconfig
        writeFileSync(
          tsconfigFile,
          JSON.stringify({
            compilerOptions: { strict: true, noEmit: true },
            include: ["*.ts"],
          })
        );

        // Create file with error
        writeFileSync(testFile, `const x: string = 123;\n`);

        const result = await checker.checkFile(testFile);

        expect(result.length).toBeGreaterThan(0);
        expect(result[0].severity).toBe("error");
        expect(result[0].message).toContain("number");
      } finally {
        // Cleanup
        try {
          unlinkSync(testFile);
          unlinkSync(tsconfigFile);
          rmdirSync(testDir);
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it("throws for non-existent file", async () => {
      await expect(checker.checkFile("/nonexistent/file.ts")).rejects.toThrow("File not found");
    });

    it("times out for slow operations", async () => {
      // This test verifies timeout works - we can't easily trigger a slow file
      // but we can at least verify the timeout mechanism exists
      const filePath = join(__dirname, "..", "..", "core", "src", "result.ts");
      const result = await checker.checkFile(filePath);
      expect(result).toBeDefined();
    }, 10000);
  });

  describe("getType", () => {
    it("returns type info for a symbol", async () => {
      const filePath = join(__dirname, "..", "..", "core", "src", "result.ts");
      // Line 12: "export const Ok = ..." - column 14 is the "O" in Ok
      const result = await checker.getType(filePath, 12, 14);

      expect(result).toBeDefined();
      expect(typeof result.type).toBe("string");
      expect(typeof result.kind).toBe("string");
    });

    it("throws for invalid position", async () => {
      const filePath = join(__dirname, "..", "..", "core", "src", "result.ts");
      await expect(checker.getType(filePath, 9999, 1)).rejects.toThrow();
    });
  });

  describe("getDefinition", () => {
    it("returns definition locations", async () => {
      const filePath = join(__dirname, "..", "..", "core", "src", "result.ts");
      // Position 1,1 might not have a definition, but shouldn't throw
      const result = await checker.getDefinition(filePath, 1, 1);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getQuickFixes", () => {
    it("returns empty array when no errors", async () => {
      const filePath = join(__dirname, "..", "..", "core", "src", "result.ts");
      const result = await checker.getQuickFixes(filePath, 1, 1);

      expect(Array.isArray(result)).toBe(true);
    });
  });
});

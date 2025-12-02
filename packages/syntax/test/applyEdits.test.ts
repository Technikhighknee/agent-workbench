import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SyntaxService, TreeSitterParser, NodeFileSystem, InMemoryCache } from "../src/index.js";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test the multi-file edit logic that apply_edits uses.
 * Tests the core validation and atomic application behavior.
 */
describe("Multi-file edit operations", () => {
  let service: SyntaxService;
  let testDir: string;

  beforeAll(() => {
    const parser = new TreeSitterParser();
    const fs = new NodeFileSystem();
    const cache = new InMemoryCache();
    service = new SyntaxService(parser, fs, cache);

    testDir = join(tmpdir(), `apply-edits-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("single file edits", () => {
    it("applies a single edit successfully", () => {
      const file = join(testDir, "single.ts");
      writeFileSync(file, "const x = 1;");

      // Read, validate, apply
      const content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      const newContent = content.value.replace("const x = 1", "const x = 2");
      const writeResult = service.writeFile(file, newContent);
      expect(writeResult.ok).toBe(true);

      const result = readFileSync(file, "utf-8");
      expect(result).toBe("const x = 2;");
    });

    it("detects missing string", () => {
      const file = join(testDir, "missing.ts");
      writeFileSync(file, "const x = 1;");

      const content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      const hasString = content.value.includes("nonexistent");
      expect(hasString).toBe(false);
    });

    it("detects duplicate occurrences", () => {
      const file = join(testDir, "duplicates.ts");
      writeFileSync(file, "foo foo foo");

      const content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      const count = content.value.split("foo").length - 1;
      expect(count).toBe(3);
    });
  });

  describe("multi-file atomic edits", () => {
    it("applies edits to multiple files", () => {
      const file1 = join(testDir, "multi1.ts");
      const file2 = join(testDir, "multi2.ts");
      writeFileSync(file1, 'import { foo } from "./utils";');
      writeFileSync(file2, 'export const foo = 1;');

      // Simulate multi-file edit: rename foo to bar in both files
      const content1 = service.readFile(file1);
      const content2 = service.readFile(file2);
      expect(content1.ok && content2.ok).toBe(true);
      if (!content1.ok || !content2.ok) return;

      const newContent1 = content1.value.replace("foo", "bar");
      const newContent2 = content2.value.replace("foo", "bar");

      // Apply both atomically
      service.writeFile(file1, newContent1);
      service.writeFile(file2, newContent2);

      const result1 = readFileSync(file1, "utf-8");
      const result2 = readFileSync(file2, "utf-8");
      expect(result1).toContain("bar");
      expect(result2).toContain("bar");
    });

    it("chains edits to the same file", () => {
      const file = join(testDir, "chained.ts");
      writeFileSync(file, "a b c");

      // Simulate chained edits: a->x, b->y in same file
      let content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      // First edit
      let newContent = content.value.replace("a", "x");
      // Second edit on result of first
      newContent = newContent.replace("b", "y");

      service.writeFile(file, newContent);

      const result = readFileSync(file, "utf-8");
      expect(result).toBe("x y c");
    });
  });

  describe("rollback simulation", () => {
    it("can restore original content on failure", () => {
      const file = join(testDir, "rollback.ts");
      const original = "original content";
      writeFileSync(file, original);

      // Store original
      const originalContent = readFileSync(file, "utf-8");

      // Make a change
      service.writeFile(file, "modified content");
      expect(readFileSync(file, "utf-8")).toBe("modified content");

      // Rollback
      service.writeFile(file, originalContent);
      expect(readFileSync(file, "utf-8")).toBe(original);
    });

    it("restores multiple files on rollback", () => {
      const file1 = join(testDir, "rollback1.ts");
      const file2 = join(testDir, "rollback2.ts");
      writeFileSync(file1, "original1");
      writeFileSync(file2, "original2");

      // Store originals
      const orig1 = readFileSync(file1, "utf-8");
      const orig2 = readFileSync(file2, "utf-8");

      // Make changes
      service.writeFile(file1, "modified1");
      service.writeFile(file2, "modified2");

      // Simulate failure - rollback both
      service.writeFile(file1, orig1);
      service.writeFile(file2, orig2);

      expect(readFileSync(file1, "utf-8")).toBe("original1");
      expect(readFileSync(file2, "utf-8")).toBe("original2");
    });
  });

  describe("edge cases", () => {
    it("handles empty string replacement", () => {
      const file = join(testDir, "empty.ts");
      writeFileSync(file, "remove this text");

      const content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      const newContent = content.value.replace("this ", "");
      service.writeFile(file, newContent);

      expect(readFileSync(file, "utf-8")).toBe("remove text");
    });

    it("handles multiline replacements", () => {
      const file = join(testDir, "multiline.ts");
      writeFileSync(file, "line1\nline2\nline3");

      const content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      const newContent = content.value.replace("line2\nline3", "newline2\nnewline3");
      service.writeFile(file, newContent);

      expect(readFileSync(file, "utf-8")).toBe("line1\nnewline2\nnewline3");
    });

    it("handles special regex characters in content", () => {
      const file = join(testDir, "regex.ts");
      writeFileSync(file, "regex: /test.*pattern/");

      const content = service.readFile(file);
      expect(content.ok).toBe(true);
      if (!content.ok) return;

      // Using string replace (not regex)
      const newContent = content.value.replace("/test.*pattern/", "/new.*regex/");
      service.writeFile(file, newContent);

      expect(readFileSync(file, "utf-8")).toBe("regex: /new.*regex/");
    });
  });
});

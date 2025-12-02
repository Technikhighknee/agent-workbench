import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SyntaxService, TreeSitterParser, NodeFileSystem, InMemoryCache } from "../src/index.js";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("SyntaxService", () => {
  let service: SyntaxService;
  let testDir: string;

  beforeAll(() => {
    const parser = new TreeSitterParser();
    const fs = new NodeFileSystem();
    const cache = new InMemoryCache();
    service = new SyntaxService(parser, fs, cache);

    // Create a unique temp directory for tests
    testDir = join(tmpdir(), `syntax-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up temp directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("listSymbols", () => {
    it("lists all symbols in a file", async () => {
      const testFile = join(testDir, "list-symbols.ts");
      writeFileSync(testFile, `
export function hello() { return "hi"; }
export class Greeter {
  greet() { return "Hello"; }
}
const secret = 42;
`);

      const result = await service.listSymbols({ filePath: testFile });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const names = result.value.map(s => s.name);
      expect(names).toContain("hello");
      expect(names).toContain("Greeter");
      expect(names).toContain("secret");
    });

    it("filters by depth", async () => {
      const testFile = join(testDir, "depth.ts");
      writeFileSync(testFile, `
export class Parent {
  child() { return 1; }
}
`);

      const result = await service.listSymbols({ filePath: testFile, depth: 0 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Depth 0 should only show top-level symbols
      const names = result.value.map(s => s.name);
      expect(names).toContain("Parent");
      expect(names).not.toContain("child");
    });

    it("filters by kind", async () => {
      const testFile = join(testDir, "kinds.ts");
      writeFileSync(testFile, `
export function func() {}
export class MyClass {}
const myVar = 1;
`);

      const result = await service.listSymbols({ filePath: testFile, kinds: ["function"] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const names = result.value.map(s => s.name);
      expect(names).toContain("func");
      expect(names).not.toContain("MyClass");
      expect(names).not.toContain("myVar");
    });
  });

  describe("readSymbol", () => {
    it("reads a top-level function", async () => {
      const testFile = join(testDir, "read-symbol.ts");
      writeFileSync(testFile, `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function goodbye() {
  return "bye";
}
`);

      const result = await service.readSymbol({ filePath: testFile, namePath: "greet" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe("greet");
      expect(result.value.body).toContain("function greet");
      expect(result.value.body).toContain("Hello");
    });

    it("reads a nested method", async () => {
      const testFile = join(testDir, "nested-method.ts");
      writeFileSync(testFile, `
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  subtract(a: number, b: number): number {
    return a - b;
  }
}
`);

      const result = await service.readSymbol({ filePath: testFile, namePath: "Calculator/add" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe("add");
      expect(result.value.body).toContain("a + b");
    });

    it("returns error for non-existent symbol", async () => {
      const testFile = join(testDir, "read-noexist.ts");
      writeFileSync(testFile, `export function exists() {}`);

      const result = await service.readSymbol({ filePath: testFile, namePath: "doesNotExist" });
      expect(result.ok).toBe(false);
    });
  });

  describe("editSymbol", () => {
    it("edits a function", async () => {
      const testFile = join(testDir, "edit-func.ts");
      writeFileSync(testFile, `
export function calculate(x: number): number {
  return x * 2;
}
`);

      const newBody = `export function calculate(x: number): number {
  return x * 3;
}`;

      const result = await service.editSymbol({
        filePath: testFile,
        namePath: "calculate",
        newBody: newBody,
      });
      expect(result.ok).toBe(true);

      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("x * 3");
      expect(content).not.toContain("x * 2");
    });

    it("edits a class method", async () => {
      const testFile = join(testDir, "edit-method.ts");
      writeFileSync(testFile, `
export class Counter {
  private count = 0;
  increment() {
    this.count++;
  }
}
`);

      const newBody = `increment() {
    this.count += 2;
  }`;

      const result = await service.editSymbol({
        filePath: testFile,
        namePath: "Counter/increment",
        newBody: newBody,
      });
      expect(result.ok).toBe(true);

      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("count += 2");
      expect(content).not.toContain("count++");
    });
  });

  describe("editLines", () => {
    it("replaces a range of lines", async () => {
      const testFile = join(testDir, "edit-lines.ts");
      writeFileSync(testFile, `line 1
line 2
line 3
line 4
line 5
`);

      const result = await service.editLines({
        filePath: testFile,
        startLine: 2,
        endLine: 4,
        newContent: "replaced 2\nreplaced 3\nreplaced 4",
      });
      expect(result.ok).toBe(true);

      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("replaced 2");
      expect(content).toContain("replaced 3");
      expect(content).toContain("replaced 4");
      expect(content).not.toContain("line 2");
      expect(content).not.toContain("line 3");
      expect(content).not.toContain("line 4");
    });

    it("deletes lines when new_content is empty", async () => {
      const testFile = join(testDir, "delete-lines.ts");
      writeFileSync(testFile, `keep 1
delete me
keep 2
`);

      const result = await service.editLines({
        filePath: testFile,
        startLine: 2,
        endLine: 2,
        newContent: "",
      });
      expect(result.ok).toBe(true);

      const content = readFileSync(testFile, "utf-8");
      expect(content).toContain("keep 1");
      expect(content).toContain("keep 2");
      expect(content).not.toContain("delete me");
    });
  });

  describe("getImports", () => {
    it("extracts named imports", async () => {
      const filePath = join(testDir, "imports.ts");
      writeFileSync(filePath, `
import { readFile, writeFile } from "fs";
import type { Config } from "./config";
`);

      const result = await service.getImports(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const fsImport = result.value.find(i => i.source === "fs");
      expect(fsImport).toBeDefined();
      expect(fsImport?.bindings.map(b => b.name)).toContain("readFile");
      expect(fsImport?.bindings.map(b => b.name)).toContain("writeFile");
    });

    it("extracts default imports", async () => {
      const filePath = join(testDir, "default-import.ts");
      writeFileSync(filePath, `
import React from "react";
`);

      const result = await service.getImports(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const reactImport = result.value.find(i => i.source === "react");
      expect(reactImport).toBeDefined();
      expect(reactImport?.type).toBe("default");
    });

    it("extracts namespace imports", async () => {
      const filePath = join(testDir, "namespace-import.ts");
      writeFileSync(filePath, `
import * as path from "path";
`);

      const result = await service.getImports(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const pathImport = result.value.find(i => i.source === "path");
      expect(pathImport).toBeDefined();
      expect(pathImport?.type).toBe("namespace");
    });
  });

  describe("getExports", () => {
    it("extracts named exports", async () => {
      const filePath = join(testDir, "exports.ts");
      writeFileSync(filePath, `
export function helper() {}
export const VERSION = "1.0";
export class Utils {}
`);

      const result = await service.getExports(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const names = result.value.flatMap(e => e.bindings.map(b => b.name));
      expect(names).toContain("helper");
      expect(names).toContain("VERSION");
      expect(names).toContain("Utils");
    });

    it("extracts default exports", async () => {
      const filePath = join(testDir, "default-export.ts");
      writeFileSync(filePath, `
export default function main() {}
`);

      const result = await service.getExports(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const defaultExport = result.value.find(e => e.type === "default");
      expect(defaultExport).toBeDefined();
    });

    it("extracts re-exports", async () => {
      const filePath = join(testDir, "reexport.ts");
      writeFileSync(filePath, `
export { helper } from "./utils";
export * from "./types";
`);

      const result = await service.getExports(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const namedReexport = result.value.find(e => e.type === "reexport");
      expect(namedReexport).toBeDefined();

      const namespaceReexport = result.value.find(e => e.type === "namespace");
      expect(namespaceReexport).toBeDefined();
    });
  });

  describe("readFile and writeFile", () => {
    it("reads file content", () => {
      const filePath = join(testDir, "read-write.ts");
      const content = "const x = 42;";
      writeFileSync(filePath, content);

      const result = service.readFile(filePath);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(content);
      }
    });

    it("writes file content", () => {
      const filePath = join(testDir, "write-new.ts");
      const content = "const y = 100;";

      const result = service.writeFile(filePath, content);
      expect(result.ok).toBe(true);

      const readBack = readFileSync(filePath, "utf-8");
      expect(readBack).toBe(content);
    });
  });

  describe("file operations", () => {
    it("moves a file", () => {
      const srcPath = join(testDir, "move-src.ts");
      const dstPath = join(testDir, "move-dst.ts");
      writeFileSync(srcPath, "const moveme = true;");

      const result = service.moveFile(srcPath, dstPath);
      expect(result.ok).toBe(true);

      const content = readFileSync(dstPath, "utf-8");
      expect(content).toBe("const moveme = true;");
    });

    it("deletes a file", () => {
      const filePath = join(testDir, "delete-me.ts");
      writeFileSync(filePath, "goodbye");

      const result = service.deleteFile(filePath);
      expect(result.ok).toBe(true);

      const readResult = service.readFile(filePath);
      expect(readResult.ok).toBe(false);
    });
  });
});

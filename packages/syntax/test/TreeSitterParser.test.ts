import { describe, it, expect, beforeAll } from "vitest";
import { TreeSitterParser } from "../src/infrastructure/parsers/TreeSitterParser.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

describe("TreeSitterParser", () => {
  let parser: TreeSitterParser;

  beforeAll(() => {
    parser = new TreeSitterParser();
  });

  describe("TypeScript parsing", () => {
    const tsFile = join(FIXTURES, "sample.ts");
    const source = readFileSync(tsFile, "utf-8");

    it("parses TypeScript file without errors", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.errors).toHaveLength(0);
      }
    });

    it("extracts class symbols", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const calculator = symbols.find((s) => s.name === "Calculator");
      expect(calculator).toBeDefined();
      expect(calculator?.kind).toBe("class");
    });

    it("extracts class methods", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const calculator = symbols.find((s) => s.name === "Calculator");
      expect(calculator?.children).toBeDefined();

      const methodNames = calculator?.children.map((c) => c.name) ?? [];
      expect(methodNames).toContain("add");
      expect(methodNames).toContain("subtract");
      expect(methodNames).toContain("getValue");
    });

    it("extracts function symbols", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const multiply = symbols.find((s) => s.name === "multiply");
      expect(multiply).toBeDefined();
      expect(multiply?.kind).toBe("function");
    });

    it("extracts interface symbols", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const user = symbols.find((s) => s.name === "User");
      expect(user).toBeDefined();
      expect(user?.kind).toBe("interface");
    });

    it("extracts type alias symbols", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const status = symbols.find((s) => s.name === "Status");
      expect(status).toBeDefined();
      expect(status?.kind).toBe("type_alias");
    });

    it("extracts variable/constant symbols", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const version = symbols.find((s) => s.name === "VERSION");
      expect(version).toBeDefined();
      expect(version?.kind).toBe("variable");
    });

    it("extracts documentation comments", async () => {
      const result = await parser.parse(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const calculator = symbols.find((s) => s.name === "Calculator");
      expect(calculator?.documentation).toContain("simple calculator");
    });
  });

  describe("Python parsing", () => {
    const pyFile = join(FIXTURES, "sample.py");
    const source = readFileSync(pyFile, "utf-8");

    it("parses Python file without errors", async () => {
      const result = await parser.parse(source, pyFile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.errors).toHaveLength(0);
      }
    });

    it("extracts class symbols", async () => {
      const result = await parser.parse(source, pyFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const calculator = symbols.find((s) => s.name === "Calculator");
      expect(calculator).toBeDefined();
      expect(calculator?.kind).toBe("class");
    });

    it("extracts function symbols", async () => {
      const result = await parser.parse(source, pyFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const greet = symbols.find((s) => s.name === "greet");
      expect(greet).toBeDefined();
      expect(greet?.kind).toBe("function");
    });

    it("extracts decorated functions", async () => {
      const result = await parser.parse(source, pyFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const calculator = symbols.find((s) => s.name === "Calculator");
      const multiply = calculator?.children.find((c) => c.name === "multiply");
      expect(multiply).toBeDefined();
    });

    it("extracts Python docstrings", async () => {
      const result = await parser.parse(source, pyFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const symbols = result.value.tree.symbols;
      const calculator = symbols.find((s) => s.name === "Calculator");
      expect(calculator?.documentation).toContain("simple calculator");
    });
  });

  describe("Import extraction", () => {
    const tsFile = join(FIXTURES, "sample.ts");
    const source = readFileSync(tsFile, "utf-8");

    it("extracts named imports", async () => {
      const result = await parser.extractImports(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const imports = result.value;
      const fsImport = imports.find((i) => i.source === "fs/promises");
      expect(fsImport).toBeDefined();
      expect(fsImport?.type).toBe("named");
      expect(fsImport?.bindings.map((b) => b.name)).toContain("readFile");
    });

    it("extracts type imports", async () => {
      const result = await parser.extractImports(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const imports = result.value;
      const typeImport = imports.find((i) => i.source === "./types");
      expect(typeImport).toBeDefined();
      expect(typeImport?.type).toBe("type");
    });
  });

  describe("Export extraction", () => {
    const tsFile = join(FIXTURES, "sample.ts");
    const source = readFileSync(tsFile, "utf-8");

    it("extracts exported declarations", async () => {
      const result = await parser.extractExports(source, tsFile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const exports = result.value;
      const names = exports.flatMap((e) => e.bindings.map((b) => b.name));
      expect(names).toContain("Calculator");
      expect(names).toContain("multiply");
      expect(names).toContain("VERSION");
    });
  });

  describe("Language detection", () => {
    it("detects TypeScript files", () => {
      expect(parser.detectLanguage("test.ts")?.id).toBe("typescript");
      expect(parser.detectLanguage("test.tsx")?.id).toBe("typescript");
    });

    it("detects JavaScript files", () => {
      expect(parser.detectLanguage("test.js")?.id).toBe("javascript");
      expect(parser.detectLanguage("test.jsx")?.id).toBe("javascript");
    });

    it("detects Python files", () => {
      expect(parser.detectLanguage("test.py")?.id).toBe("python");
    });

    it("detects Go files", () => {
      expect(parser.detectLanguage("test.go")?.id).toBe("go");
    });

    it("detects Rust files", () => {
      expect(parser.detectLanguage("test.rs")?.id).toBe("rust");
    });

    it("returns undefined for unknown extensions", () => {
      expect(parser.detectLanguage("test.unknown")).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("handles empty files", async () => {
      const result = await parser.parse("", "empty.ts");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tree.symbols).toHaveLength(0);
      }
    });

    it("handles files with only comments", async () => {
      const source = "// Just a comment\n/* Another comment */";
      const result = await parser.parse(source, "comments.ts");
      expect(result.ok).toBe(true);
    });

    it("returns error for unsupported language", async () => {
      const result = await parser.parse("code", "file.unsupported");
      expect(result.ok).toBe(false);
    });
  });
});

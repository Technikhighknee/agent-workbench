/**
 * Smoke test for syntax package.
 * Run with: npx tsx test/smoke.ts
 */

import { TreeSitterParser } from "../src/infrastructure/parsers/TreeSitterParser.js";
import { NodeFileSystem } from "../src/infrastructure/filesystem/NodeFileSystem.js";
import { InMemoryCache } from "../src/infrastructure/cache/InMemoryCache.js";
import { SyntaxService } from "../src/core/services/SyntaxService.js";

async function main() {
  console.log("🧪 Syntax Package Smoke Test\n");

  const parser = new TreeSitterParser();
  const fs = new NodeFileSystem();
  const cache = new InMemoryCache();
  const service = new SyntaxService(parser, fs, cache);

  // Test 1: Parse TypeScript
  console.log("1. Parsing TypeScript...");
  const source = `
/**
 * A sample class for testing.
 */
export class Sample {
  private value: number;

  constructor(value: number) {
    this.value = value;
  }

  /** Get the value */
  getValue(): number {
    return this.value;
  }
}

export function helper(x: number): number {
  return x * 2;
}
`;

  const result = await parser.parse(source, "sample.ts");
  if (!result.ok) {
    console.error("❌ Parse failed:", result.error);
    process.exit(1);
  }

  const symbols = result.value.tree.symbols;
  console.log(`   Found ${symbols.length} top-level symbols`);

  // Verify class was found
  const sampleClass = symbols.find((s) => s.name === "Sample");
  if (!sampleClass) {
    console.error("❌ Sample class not found");
    process.exit(1);
  }
  console.log(`   ✓ Sample class found with ${sampleClass.children.length} children`);

  // Verify documentation was extracted
  if (!sampleClass.documentation) {
    console.error("❌ Documentation not extracted");
    process.exit(1);
  }
  console.log(`   ✓ Documentation extracted: "${sampleClass.documentation.slice(0, 30)}..."`);

  // Verify function was found
  const helperFn = symbols.find((s) => s.name === "helper");
  if (!helperFn) {
    console.error("❌ helper function not found");
    process.exit(1);
  }
  console.log("   ✓ helper function found");

  // Test 2: Verify no local variables captured
  console.log("\n2. Verifying no local variables in function symbols...");
  if (helperFn.children.length > 0) {
    console.error("❌ Function has children (local variables leaked):", helperFn.children);
    process.exit(1);
  }
  console.log("   ✓ No local variables captured");

  // Test 3: Multi-language support
  console.log("\n3. Testing language detection...");
  const languages = [
    { file: "test.ts", expected: "typescript" },
    { file: "test.tsx", expected: "typescript" },
    { file: "test.js", expected: "javascript" },
    { file: "test.py", expected: "python" },
    { file: "test.go", expected: "go" },
    { file: "test.rs", expected: "rust" },
  ];

  for (const { file, expected } of languages) {
    const lang = parser.detectLanguage(file);
    if (!lang) {
      console.error(`❌ Language not detected for ${file}`);
      process.exit(1);
    }
    if (lang.id !== expected) {
      console.error(`❌ Wrong language for ${file}: got ${lang.id}, expected ${expected}`);
      process.exit(1);
    }
    console.log(`   ✓ ${file} → ${lang.id}`);
  }

  // Test 4: Import extraction
  console.log("\n4. Testing import extraction...");
  const importSource = `
import Parser from "tree-sitter";
import { Foo, Bar as Baz } from "./utils.js";
import * as path from "path";
import type { Result } from "./result.js";
import "side-effects";
`;

  const importResult = await parser.extractImports(importSource, "test.ts");
  if (!importResult.ok) {
    console.error("❌ Import extraction failed:", importResult.error);
    process.exit(1);
  }

  const imports = importResult.value;
  console.log(`   Found ${imports.length} imports`);

  // Check default import
  const defaultImport = imports.find((i) => i.source === "tree-sitter");
  if (!defaultImport || defaultImport.type !== "default") {
    console.error("❌ Default import not found or wrong type");
    process.exit(1);
  }
  console.log("   ✓ Default import: tree-sitter");

  // Check named imports
  const namedImport = imports.find((i) => i.source === "./utils.js");
  if (!namedImport || namedImport.bindings.length !== 2) {
    console.error("❌ Named imports not found:", namedImport);
    process.exit(1);
  }
  const bazBinding = namedImport.bindings.find((b) => b.name === "Baz");
  if (!bazBinding || bazBinding.originalName !== "Bar") {
    console.error("❌ Aliased import not captured:", bazBinding);
    process.exit(1);
  }
  console.log("   ✓ Named imports with alias: Foo, Bar as Baz");

  // Check namespace import
  const nsImport = imports.find((i) => i.source === "path");
  if (!nsImport || nsImport.type !== "namespace") {
    console.error("❌ Namespace import not found:", nsImport);
    process.exit(1);
  }
  console.log("   ✓ Namespace import: * as path");

  // Check type import
  const typeImport = imports.find((i) => i.source === "./result.js");
  if (!typeImport || typeImport.type !== "type") {
    console.error("❌ Type import not found:", typeImport);
    process.exit(1);
  }
  console.log("   ✓ Type import: Result");

  // Check side-effect import
  const sideEffectImport = imports.find((i) => i.source === "side-effects");
  if (!sideEffectImport || sideEffectImport.type !== "side_effect") {
    console.error("❌ Side-effect import not found:", sideEffectImport);
    process.exit(1);
  }
  console.log("   ✓ Side-effect import: side-effects");

  // Test 5: Export extraction
  console.log("\n5. Testing export extraction...");
  const exportSource = `
export default function main() {}
export { foo, bar as baz };
export const VALUE = 42;
export class MyClass {}
export type MyType = string;
export * from "./utils.js";
export { renamed as exported } from "./other.js";
`;

  const exportResult = await parser.extractExports(exportSource, "test.ts");
  if (!exportResult.ok) {
    console.error("❌ Export extraction failed:", exportResult.error);
    process.exit(1);
  }

  const exports = exportResult.value;
  console.log(`   Found ${exports.length} exports`);

  // Check default export
  const defaultExport = exports.find((e) => e.type === "default");
  if (!defaultExport) {
    console.error("❌ Default export not found");
    process.exit(1);
  }
  console.log("   ✓ Default export: function main");

  // Check named exports
  const namedExport = exports.find(
    (e) => e.type === "named" && e.bindings.some((b) => b.name === "foo")
  );
  if (!namedExport) {
    console.error("❌ Named exports not found");
    process.exit(1);
  }
  const exportBazBinding = namedExport.bindings.find((b) => b.name === "baz");
  if (!exportBazBinding || exportBazBinding.localName !== "bar") {
    console.error("❌ Aliased export not captured:", exportBazBinding);
    process.exit(1);
  }
  console.log("   ✓ Named exports with alias: foo, bar as baz");

  // Check declaration exports
  const valueExport = exports.find(
    (e) => e.type === "declaration" && e.bindings.some((b) => b.name === "VALUE")
  );
  if (!valueExport) {
    console.error("❌ Const export not found");
    process.exit(1);
  }
  console.log("   ✓ Declaration export: VALUE");

  // Check namespace re-export
  const namespaceExport = exports.find(
    (e) => e.type === "namespace" && e.source === "./utils.js"
  );
  if (!namespaceExport) {
    console.error("❌ Namespace re-export not found");
    process.exit(1);
  }
  console.log("   ✓ Namespace re-export: * from ./utils.js");

  // Check named re-export
  const reexport = exports.find(
    (e) => e.type === "reexport" && e.source === "./other.js"
  );
  if (!reexport) {
    console.error("❌ Named re-export not found");
    process.exit(1);
  }
  console.log("   ✓ Named re-export: renamed as exported from ./other.js");

  console.log("\n✅ All smoke tests passed!\n");
}

main().catch((err) => {
  console.error("❌ Test failed with error:", err);
  process.exit(1);
});

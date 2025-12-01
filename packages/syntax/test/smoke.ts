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

  console.log("\n✅ All smoke tests passed!\n");
}

main().catch((err) => {
  console.error("❌ Test failed with error:", err);
  process.exit(1);
});

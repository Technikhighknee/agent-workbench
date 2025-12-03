#!/usr/bin/env npx tsx
/**
 * Stress Test - Verify stability under concurrent load
 *
 * Tests:
 * 1. Concurrent operations on same package
 * 2. Rapid sequential operations
 * 3. Memory stability under repeated load
 */

import { TypeChecker } from "../packages/types/src/TypeChecker.js";
import { SyntaxService } from "../packages/syntax/src/core/services/SyntaxService.js";
import { ProjectIndex } from "../packages/syntax/src/core/services/ProjectIndex.js";
import { TreeSitterParser } from "../packages/syntax/src/infrastructure/parsers/TreeSitterParser.js";
import { NodeFileSystem } from "../packages/syntax/src/infrastructure/filesystem/NodeFileSystem.js";
import { InMemoryCache } from "../packages/syntax/src/infrastructure/cache/InMemoryCache.js";
import { NodeProjectScanner } from "../packages/syntax/src/infrastructure/scanner/NodeProjectScanner.js";
import path from "path";

const PROJECT_ROOT = process.cwd();
const TEST_FILES = [
  path.join(PROJECT_ROOT, "packages/core/src/result.ts"),
  path.join(PROJECT_ROOT, "packages/core/src/server.ts"),
  path.join(PROJECT_ROOT, "packages/syntax/src/core/model.ts"),
  path.join(PROJECT_ROOT, "packages/types/src/TypeChecker.ts"),
];

function getMemoryMB(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

async function stressTestTypes(iterations: number = 50): Promise<{ success: number; errors: number; avgTime: number }> {
  console.log(`\n🔥 Stress test: types (${iterations} concurrent operations)`);
  const checker = new TypeChecker();

  // Warm up
  await checker.checkFile(TEST_FILES[0]);

  const startMem = getMemoryMB();
  const startTime = performance.now();
  let success = 0;
  let errors = 0;

  // Run concurrent operations
  const promises = Array.from({ length: iterations }, async (_, i) => {
    const file = TEST_FILES[i % TEST_FILES.length];
    try {
      await checker.checkFile(file);
      success++;
    } catch (e) {
      errors++;
    }
  });

  await Promise.all(promises);

  const endTime = performance.now();
  const endMem = getMemoryMB();
  const avgTime = (endTime - startTime) / iterations;

  console.log(`   ✓ ${success}/${iterations} succeeded, ${errors} errors`);
  console.log(`   ✓ Avg time: ${avgTime.toFixed(1)}ms per operation`);
  console.log(`   ✓ Memory: ${startMem}MB → ${endMem}MB (${endMem - startMem > 0 ? '+' : ''}${endMem - startMem}MB)`);

  return { success, errors, avgTime };
}

async function stressTestSyntax(iterations: number = 100): Promise<{ success: number; errors: number; avgTime: number }> {
  console.log(`\n🔥 Stress test: syntax (${iterations} rapid operations)`);

  const parser = new TreeSitterParser();
  const fs = new NodeFileSystem();
  const cache = new InMemoryCache();
  const scanner = new NodeProjectScanner();
  const service = new SyntaxService(parser, fs, cache);
  const index = new ProjectIndex(parser, fs, cache, scanner);

  // Initialize index
  await index.index(PROJECT_ROOT);

  const startMem = getMemoryMB();
  const startTime = performance.now();
  let success = 0;
  let errors = 0;

  // Run rapid sequential operations
  for (let i = 0; i < iterations; i++) {
    try {
      const file = TEST_FILES[i % TEST_FILES.length];
      service.listSymbols(file);
      index.searchSymbols("Result");
      success += 2;
    } catch (e) {
      errors++;
    }
  }

  const endTime = performance.now();
  const endMem = getMemoryMB();
  const avgTime = (endTime - startTime) / (iterations * 2);

  console.log(`   ✓ ${success}/${iterations * 2} operations succeeded, ${errors} errors`);
  console.log(`   ✓ Avg time: ${avgTime.toFixed(2)}ms per operation`);
  console.log(`   ✓ Memory: ${startMem}MB → ${endMem}MB (${endMem - startMem > 0 ? '+' : ''}${endMem - startMem}MB)`);

  return { success, errors, avgTime };
}

async function stressTestMixed(iterations: number = 30): Promise<{ success: number; errors: number }> {
  console.log(`\n🔥 Stress test: mixed concurrent (${iterations} mixed operations)`);

  const checker = new TypeChecker();
  const parser = new TreeSitterParser();
  const fs = new NodeFileSystem();
  const cache = new InMemoryCache();
  const scanner = new NodeProjectScanner();
  const service = new SyntaxService(parser, fs, cache);
  const index = new ProjectIndex(parser, fs, cache, scanner);

  // Initialize
  await checker.checkFile(TEST_FILES[0]);
  await index.index(PROJECT_ROOT);

  const startMem = getMemoryMB();
  let success = 0;
  let errors = 0;

  // Mix of operations - some concurrent, some sequential
  const operations = Array.from({ length: iterations }, async (_, i) => {
    const file = TEST_FILES[i % TEST_FILES.length];
    try {
      if (i % 3 === 0) {
        await checker.checkFile(file);
      } else if (i % 3 === 1) {
        service.listSymbols(file);
      } else {
        index.findReferences("Result");
      }
      success++;
    } catch (e) {
      errors++;
    }
  });

  await Promise.all(operations);

  const endMem = getMemoryMB();
  console.log(`   ✓ ${success}/${iterations} operations succeeded, ${errors} errors`);
  console.log(`   ✓ Memory: ${startMem}MB → ${endMem}MB (${endMem - startMem > 0 ? '+' : ''}${endMem - startMem}MB)`);

  return { success, errors };
}

async function stressTestMemoryStability(cycles: number = 5): Promise<boolean> {
  console.log(`\n🔥 Stress test: memory stability (${cycles} GC cycles)`);

  // Use syntax service for memory stability testing - it's lightweight
  // TypeChecker caches parsed files by design, so it's not suitable for leak detection
  const parser = new TreeSitterParser();
  const fs = new NodeFileSystem();
  const cache = new InMemoryCache();
  const service = new SyntaxService(parser, fs, cache);

  const memoryReadings: number[] = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    // Clear cache between cycles to test memory reclamation
    cache.clear();

    // Run operations
    for (let i = 0; i < 50; i++) {
      const file = TEST_FILES[i % TEST_FILES.length];
      service.listSymbols(file);
    }

    // Force GC if available
    if (global.gc) {
      global.gc();
    }

    // Record memory
    memoryReadings.push(getMemoryMB());
    console.log(`   Cycle ${cycle + 1}: ${memoryReadings[cycle]}MB`);
  }

  // Check for memory leak (significant growth across cycles)
  const firstHalf = memoryReadings.slice(0, Math.floor(cycles / 2));
  const secondHalf = memoryReadings.slice(Math.floor(cycles / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const growth = avgSecond - avgFirst;

  const stable = growth < 100; // Less than 100MB growth is acceptable
  console.log(`   ${stable ? '✓' : '✗'} Memory growth: ${growth.toFixed(1)}MB (${stable ? 'stable' : 'LEAK DETECTED'})`);

  return stable;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("                    STRESS TEST                                 ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Project: ${PROJECT_ROOT}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Initial memory: ${getMemoryMB()}MB`);

  const results: { test: string; passed: boolean }[] = [];

  // Test 1: Concurrent types operations
  try {
    const typesResult = await stressTestTypes(50);
    results.push({
      test: "types:concurrent",
      passed: typesResult.errors === 0 && typesResult.avgTime < 1000,
    });
  } catch (e) {
    console.error("Types stress test failed:", e);
    results.push({ test: "types:concurrent", passed: false });
  }

  // Test 2: Rapid syntax operations
  try {
    const syntaxResult = await stressTestSyntax(100);
    results.push({
      test: "syntax:rapid",
      passed: syntaxResult.errors === 0 && syntaxResult.avgTime < 50,
    });
  } catch (e) {
    console.error("Syntax stress test failed:", e);
    results.push({ test: "syntax:rapid", passed: false });
  }

  // Test 3: Mixed concurrent operations
  try {
    const mixedResult = await stressTestMixed(30);
    results.push({
      test: "mixed:concurrent",
      passed: mixedResult.errors === 0,
    });
  } catch (e) {
    console.error("Mixed stress test failed:", e);
    results.push({ test: "mixed:concurrent", passed: false });
  }

  // Test 4: Memory stability
  try {
    const memoryStable = await stressTestMemoryStability(5);
    results.push({
      test: "memory:stability",
      passed: memoryStable,
    });
  } catch (e) {
    console.error("Memory stability test failed:", e);
    results.push({ test: "memory:stability", passed: false });
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                       SUMMARY                                  ");
  console.log("═══════════════════════════════════════════════════════════════");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    console.log(`${r.passed ? "✅" : "❌"} ${r.test}`);
  }

  console.log(`\nFinal memory: ${getMemoryMB()}MB`);
  console.log(`\n${passed}/${results.length} stress tests passed`);

  if (failed > 0) {
    console.log("\n❌ STRESS TEST FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ ALL STRESS TESTS PASSED");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

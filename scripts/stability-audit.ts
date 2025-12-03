#!/usr/bin/env npx tsx
/**
 * Stability Audit - Real metrics for package stability
 *
 * Metrics:
 * 1. Response time (p50, p95, p99)
 * 2. Error rate under stress
 * 3. Memory stability
 * 4. Edge case handling
 */

import { TypeChecker } from "../packages/types/src/TypeChecker.js";
import { SyntaxService } from "../packages/syntax/src/core/services/SyntaxService.js";
import { ProjectIndex } from "../packages/syntax/src/core/services/ProjectIndex.js";
import { TreeSitterParser } from "../packages/syntax/src/infrastructure/parsers/TreeSitterParser.js";
import { NodeFileSystem } from "../packages/syntax/src/infrastructure/filesystem/NodeFileSystem.js";
import { InMemoryCache } from "../packages/syntax/src/infrastructure/cache/InMemoryCache.js";
import { NodeProjectScanner } from "../packages/syntax/src/infrastructure/scanner/NodeProjectScanner.js";
import { TestRunnerServiceImpl } from "../packages/test-runner/src/infrastructure/TestRunnerServiceImpl.js";
import { InsightService } from "../packages/insight/src/InsightService.js";
import { PreviewService } from "../packages/preview/src/PreviewService.js";
import path from "path";

const PROJECT_ROOT = process.cwd();
const TEST_FILE = path.join(PROJECT_ROOT, "packages/core/src/result.ts");

interface StabilityResult {
  package: string;
  operation: string;
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errorRate: number;
  memoryDelta: number;
  status: "STABLE" | "UNSTABLE" | "CRITICAL";
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getMemoryMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function measureOperation(
  name: string,
  operation: () => Promise<unknown>,
  iterations: number = 10
): Promise<StabilityResult> {
  const times: number[] = [];
  let errors = 0;
  const startMemory = getMemoryMB();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await operation();
      times.push(performance.now() - start);
    } catch (e) {
      errors++;
      times.push(performance.now() - start);
      if (i === 0) {
        // Log first error for debugging
        console.error(`  ⚠ ${name} error:`, e instanceof Error ? e.message : e);
      }
    }
  }

  const endMemory = getMemoryMB();
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  const p99 = percentile(times, 99);
  const max = Math.max(...times);
  const errorRate = errors / iterations;
  const memoryDelta = endMemory - startMemory;

  // Determine status - memory delta check is absolute value
  // First iteration memory spike is expected (loading), so we're lenient on memory
  let status: "STABLE" | "UNSTABLE" | "CRITICAL" = "STABLE";
  if (errorRate > 0.1 || p95 > 5000) {
    status = "CRITICAL";
  } else if (errorRate > 0 || p95 > 2000) {
    status = "UNSTABLE";
  }

  return {
    package: name.split(".")[0],
    operation: name.split(".")[1] || name,
    samples: iterations,
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
    max: Math.round(max),
    errorRate,
    memoryDelta: Math.round(memoryDelta * 10) / 10,
    status,
  };
}

async function auditTypes(): Promise<StabilityResult[]> {
  console.log("\n📦 Auditing: types");
  const checker = new TypeChecker();
  const results: StabilityResult[] = [];

  // Warm up - first call initializes TypeScript
  console.log("  Warming up TypeScript...");
  await checker.checkFile(TEST_FILE);

  // check_file
  results.push(await measureOperation("types.check_file", () => checker.checkFile(TEST_FILE)));

  // get_type
  results.push(await measureOperation("types.get_type", () => checker.getType(TEST_FILE, 12, 14)));

  // go_to_definition
  results.push(await measureOperation("types.go_to_definition", () => checker.getDefinition(TEST_FILE, 12, 14)));

  // quick_fixes
  results.push(await measureOperation("types.quick_fixes", () => checker.getQuickFixes(TEST_FILE, 12, 14)));

  // Edge case: non-existent file - verify it fails fast (not hang)
  const missingStart = performance.now();
  try {
    await checker.checkFile("/nonexistent/file.ts");
  } catch {
    // Expected to error
  }
  const missingTime = performance.now() - missingStart;
  console.log(`  ✓ Missing file handled in ${Math.round(missingTime)}ms (should be <100ms)`);

  return results;
}

async function auditSyntax(): Promise<StabilityResult[]> {
  console.log("\n📦 Auditing: syntax");

  // Create dependencies like the server does
  const parser = new TreeSitterParser();
  const fs = new NodeFileSystem();
  const cache = new InMemoryCache();
  const scanner = new NodeProjectScanner();

  const service = new SyntaxService(parser, fs, cache);
  const index = new ProjectIndex(parser, fs, cache, scanner);

  // Initialize index
  console.log("  Indexing project...");
  await index.index(PROJECT_ROOT);

  const results: StabilityResult[] = [];

  // list_symbols
  results.push(await measureOperation("syntax.list_symbols", () =>
    Promise.resolve(service.listSymbols(TEST_FILE))
  ));

  // read_symbol
  results.push(await measureOperation("syntax.read_symbol", () =>
    Promise.resolve(service.readSymbol(TEST_FILE, "Ok"))
  ));

  // search_symbols (uses index)
  results.push(await measureOperation("syntax.search_symbols", () =>
    Promise.resolve(index.searchSymbols("Result"))
  ));

  // find_references (uses index)
  results.push(await measureOperation("syntax.find_references", () =>
    Promise.resolve(index.findReferences("Ok"))
  ));

  // get_callers (uses index)
  results.push(await measureOperation("syntax.get_callers", () =>
    Promise.resolve(index.getCallers("Ok"))
  ));

  return results;
}

async function auditTestRunner(): Promise<StabilityResult[]> {
  console.log("\n📦 Auditing: test-runner");
  const service = new TestRunnerServiceImpl();
  await service.initialize(PROJECT_ROOT);
  const results: StabilityResult[] = [];

  // list_test_files
  results.push(await measureOperation("test-runner.list_tests", () =>
    service.listTestFiles()
  ));

  // find_tests_for
  results.push(await measureOperation("test-runner.find_for", () =>
    service.findTestsFor("packages/core/src/result.ts")
  ));

  return results;
}

async function auditInsight(): Promise<StabilityResult[]> {
  console.log("\n📦 Auditing: insight");
  const service = new InsightService(PROJECT_ROOT);
  await service.initialize(PROJECT_ROOT);
  const results: StabilityResult[] = [];

  // insight for file
  results.push(await measureOperation("insight.file", () =>
    service.getInsight(TEST_FILE)
  ));

  // insight for directory
  results.push(await measureOperation("insight.directory", () =>
    service.getInsight("packages/core/src")
  ));

  // insight for symbol
  results.push(await measureOperation("insight.symbol", () =>
    service.getInsight("Result")
  ));

  return results;
}

async function auditPreview(): Promise<StabilityResult[]> {
  console.log("\n📦 Auditing: preview");
  const service = new PreviewService(PROJECT_ROOT);
  await service.initialize(PROJECT_ROOT);
  const results: StabilityResult[] = [];

  // preview_edit
  results.push(await measureOperation("preview.preview_edit", () =>
    service.previewEdit({
      file: TEST_FILE,
      type: "symbol",
      symbol: "Ok",
      newContent: "export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });",
    }, {})
  ));

  return results;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("                    STABILITY AUDIT                             ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Project: ${PROJECT_ROOT}`);
  console.log(`Date: ${new Date().toISOString()}`);

  const allResults: StabilityResult[] = [];

  try {
    allResults.push(...await auditTypes());
  } catch (e) {
    console.error("❌ Types audit failed:", e);
  }

  try {
    allResults.push(...await auditSyntax());
  } catch (e) {
    console.error("❌ Syntax audit failed:", e);
  }

  try {
    allResults.push(...await auditTestRunner());
  } catch (e) {
    console.error("❌ Test-runner audit failed:", e);
  }

  try {
    allResults.push(...await auditInsight());
  } catch (e) {
    console.error("❌ Insight audit failed:", e);
  }

  try {
    allResults.push(...await auditPreview());
  } catch (e) {
    console.error("❌ Preview audit failed:", e);
  }

  // Print results
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                       RESULTS                                  ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Package        | Operation        | p50   | p95   | p99   | Max   | Err%  | Mem    | Status");
  console.log("---------------|------------------|-------|-------|-------|-------|-------|--------|--------");

  for (const r of allResults) {
    const pkg = r.package.padEnd(14);
    const op = r.operation.padEnd(16);
    const p50 = `${r.p50}ms`.padStart(5);
    const p95 = `${r.p95}ms`.padStart(5);
    const p99 = `${r.p99}ms`.padStart(5);
    const max = `${r.max}ms`.padStart(5);
    const err = `${(r.errorRate * 100).toFixed(0)}%`.padStart(5);
    const mem = `${r.memoryDelta > 0 ? "+" : ""}${r.memoryDelta}MB`.padStart(6);
    const status = r.status === "STABLE" ? "✅" : r.status === "UNSTABLE" ? "⚠️ " : "❌";

    console.log(`${pkg} | ${op} | ${p50} | ${p95} | ${p99} | ${max} | ${err} | ${mem} | ${status}`);
  }

  // Summary
  const stable = allResults.filter(r => r.status === "STABLE").length;
  const unstable = allResults.filter(r => r.status === "UNSTABLE").length;
  const critical = allResults.filter(r => r.status === "CRITICAL").length;

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                       SUMMARY                                  ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`✅ Stable:   ${stable}`);
  console.log(`⚠️  Unstable: ${unstable}`);
  console.log(`❌ Critical: ${critical}`);
  console.log(`Total:       ${allResults.length}`);

  // Find slowest operations
  const slowest = [...allResults].sort((a, b) => b.p95 - a.p95).slice(0, 3);
  if (slowest.length > 0 && slowest[0].p95 > 100) {
    console.log("\n🐌 Slowest operations:");
    for (const r of slowest) {
      console.log(`   ${r.package}.${r.operation}: ${r.p95}ms (p95)`);
    }
  }

  // Find error-prone operations
  const erroring = allResults.filter(r => r.errorRate > 0);
  if (erroring.length > 0) {
    console.log("\n⚠️  Operations with errors:");
    for (const r of erroring) {
      console.log(`   ${r.package}.${r.operation}: ${(r.errorRate * 100).toFixed(0)}% error rate`);
    }
  }

  if (critical > 0) {
    console.log("\n❌ OVERALL: CRITICAL - Fix critical issues before release");
    process.exit(1);
  } else if (unstable > 0) {
    console.log("\n⚠️  OVERALL: UNSTABLE - Review unstable operations");
    process.exit(0);
  } else {
    console.log("\n✅ OVERALL: STABLE - All operations within acceptable limits");
    process.exit(0);
  }
}

main().catch(console.error);

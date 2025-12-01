/**
 * Smoke test for the test-runner package.
 * Verifies basic functionality works.
 */

import { TestRunnerServiceImpl } from "../src/infrastructure/TestRunnerServiceImpl.js";

async function main() {
  console.log("=== Test Runner Package Smoke Test ===\n");

  const service = new TestRunnerServiceImpl();

  // Test 1: Initialize the service
  console.log("1. Initializing test runner service...");
  const initResult = await service.initialize(process.cwd());

  if (!initResult.ok) {
    console.error("   ❌ Failed to initialize:", initResult.error.message);
    console.log("   (This is expected if no test framework is configured)");
    console.log("\n=== Smoke Test Complete (partial) ===");
    process.exit(0);
  }

  const config = initResult.value;
  console.log(`   ✅ Initialized: ${config.framework} framework detected`);
  console.log(`   📁 Config file: ${config.configFile}`);
  console.log();

  // Test 2: List test files
  console.log("2. Listing test files...");
  const filesResult = await service.listTestFiles();

  if (!filesResult.ok) {
    console.error("   ❌ Failed to list test files:", filesResult.error.message);
  } else {
    const files = filesResult.value;
    console.log(`   ✅ Found ${files.length} test file(s)`);
    for (const file of files.slice(0, 5)) {
      console.log(`      - ${file}`);
    }
    if (files.length > 5) {
      console.log(`      ... and ${files.length - 5} more`);
    }
  }
  console.log();

  // Test 3: Run tests (quick sanity check)
  console.log("3. Running tests...");
  const runResult = await service.runTests();

  if (!runResult.ok) {
    console.error("   ❌ Failed to run tests:", runResult.error.message);
  } else {
    const run = runResult.value;
    console.log(`   ✅ Test run completed:`);
    console.log(`      Framework: ${run.framework}`);
    console.log(`      Duration: ${run.duration}ms`);
    console.log(`      Total: ${run.summary.total}`);
    console.log(`      Passed: ${run.summary.passed}`);
    console.log(`      Failed: ${run.summary.failed}`);
    console.log(`      Skipped: ${run.summary.skipped}`);
    console.log(`      Success: ${run.success ? "✅" : "❌"}`);
  }
  console.log();

  // Test 4: Get failed tests
  console.log("4. Getting failed tests...");
  const failedResult = service.getFailedTests();

  if (!failedResult.ok) {
    console.log("   ⚠️ No previous run to check");
  } else {
    const failed = failedResult.value;
    if (failed.length === 0) {
      console.log("   ✅ No failed tests");
    } else {
      console.log(`   ⚠️ ${failed.length} failed test(s):`);
      for (const test of failed.slice(0, 3)) {
        console.log(`      - ${test.fullName}`);
      }
    }
  }
  console.log();

  console.log("=== Smoke Test Complete ===");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

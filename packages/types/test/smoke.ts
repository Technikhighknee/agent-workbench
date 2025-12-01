/**
 * Smoke test for the types package.
 * Verifies basic functionality works.
 */

import { TypeScriptService } from "../src/infrastructure/typescript/TypeScriptService.js";

async function main() {
  console.log("=== Types Package Smoke Test ===\n");

  const service = new TypeScriptService();

  // Test 1: Initialize the service
  console.log("1. Initializing TypeScript service...");
  const initResult = await service.initialize(process.cwd());

  if (!initResult.ok) {
    console.error("   ❌ Failed to initialize:", initResult.error.message);
    process.exit(1);
  }

  const info = initResult.value;
  console.log(`   ✅ Initialized: ${info.configPath}`);
  console.log(`   📁 Files: ${info.fileCount}`);
  console.log(`   🎯 Target: ${info.compilerOptions.target}`);
  console.log();

  // Test 2: Get diagnostics
  console.log("2. Getting diagnostics for project...");
  const diagsResult = await service.getDiagnostics({ limit: 5 });

  if (!diagsResult.ok) {
    console.error("   ❌ Failed to get diagnostics:", diagsResult.error.message);
  } else {
    const diags = diagsResult.value;
    if (diags.length === 0) {
      console.log("   ✅ No diagnostics found (code is type-correct)");
    } else {
      console.log(`   ✅ Found ${diags.length} diagnostic(s):`);
      for (const diag of diags.slice(0, 3)) {
        console.log(`      ${diag.severity}: ${diag.file}:${diag.line} - ${diag.message.slice(0, 50)}...`);
      }
    }
  }
  console.log();

  // Test 3: Get type at position (test our own file)
  console.log("3. Getting type at position...");
  const typeResult = service.getTypeAtPosition({
    file: "src/core/model.ts",
    line: 1,
    column: 1,
  });

  if (!typeResult.ok) {
    console.log("   ⚠️ No type info at position (expected for comment)");
  } else {
    console.log(`   ✅ Type: ${typeResult.value.type.slice(0, 50)}...`);
  }
  console.log();

  // Test 4: Get diagnostic summary
  console.log("4. Getting diagnostic summary...");
  const summaryResult = await service.getDiagnosticSummary();

  if (!summaryResult.ok) {
    console.error("   ❌ Failed:", summaryResult.error.message);
  } else {
    const summary = summaryResult.value;
    console.log(`   ✅ Summary:`);
    console.log(`      Errors: ${summary.errorCount}`);
    console.log(`      Warnings: ${summary.warningCount}`);
    console.log(`      Files with issues: ${summary.filesWithDiagnostics}/${summary.totalFiles}`);
  }
  console.log();

  // Cleanup
  service.dispose();

  console.log("=== Smoke Test Complete ===");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

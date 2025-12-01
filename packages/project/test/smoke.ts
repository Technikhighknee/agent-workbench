/**
 * Smoke test for project package.
 * Runs against the current monorepo.
 */

import { ProjectService } from "../src/core/ProjectService.js";
import * as path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

async function main() {
  console.log("Project Package Smoke Test");
  console.log("==========================\n");
  console.log(`Project root: ${projectRoot}\n`);

  const service = new ProjectService(projectRoot);

  // Test: detectType
  console.log("1. Testing detectType...");
  const type = await service.detectType();
  console.log(`   Detected type: ${type}`);
  if (type !== "npm") {
    console.error("   ERROR: Expected npm project type!");
    process.exit(1);
  }
  console.log("   PASS\n");

  // Test: getProjectInfo
  console.log("2. Testing getProjectInfo...");
  const infoResult = await service.getProjectInfo();
  if (!infoResult.ok) {
    console.error(`   ERROR: ${infoResult.error}`);
    process.exit(1);
  }
  const info = infoResult.value;
  console.log(`   Name: ${info.name}`);
  console.log(`   Version: ${info.version}`);
  console.log(`   Scripts: ${info.scripts.length}`);
  console.log(`   Dependencies: ${info.dependencies.length}`);
  if (info.workspaces) {
    console.log(`   Workspaces: ${info.workspaces.length}`);
    for (const ws of info.workspaces) {
      console.log(`     - ${ws.name} @ ${ws.path}`);
    }
  }
  console.log("   PASS\n");

  // Test: findConfigs
  console.log("3. Testing findConfigs...");
  const configsResult = await service.findConfigs();
  if (!configsResult.ok) {
    console.error(`   ERROR: ${configsResult.error}`);
    process.exit(1);
  }
  console.log(`   Found ${configsResult.value.length} config files`);
  for (const cfg of configsResult.value.slice(0, 5)) {
    console.log(`   - ${cfg.name} (${cfg.type})`);
  }
  if (configsResult.value.length > 5) {
    console.log(`   ... and ${configsResult.value.length - 5} more`);
  }
  console.log("   PASS\n");

  // Test: readConfig
  console.log("4. Testing readConfig...");
  const readResult = await service.readConfig("package.json");
  if (!readResult.ok) {
    console.error(`   ERROR: ${readResult.error}`);
    process.exit(1);
  }
  const pkg = JSON.parse(readResult.value);
  console.log(`   Read package.json successfully`);
  console.log(`   Workspaces: ${pkg.workspaces?.length || 0}`);
  console.log("   PASS\n");

  // Test on syntax subpackage
  console.log("5. Testing subpackage detection...");
  const syntaxService = new ProjectService(
    path.join(projectRoot, "packages/syntax")
  );
  const syntaxInfo = await syntaxService.getProjectInfo();
  if (!syntaxInfo.ok) {
    console.error(`   ERROR: ${syntaxInfo.error}`);
    process.exit(1);
  }
  console.log(`   Syntax package: ${syntaxInfo.value.name}`);
  console.log(`   Scripts: ${syntaxInfo.value.scripts.map((s) => s.name).join(", ")}`);
  console.log("   PASS\n");

  // Test auto-detect project root from deep subdirectory
  console.log("6. Testing auto-detect project root...");
  const deepService = new ProjectService(
    path.join(projectRoot, "packages/syntax/src/core")
  );
  const deepRoot = await deepService.getProjectRoot();
  // Should find packages/syntax (nearest package.json)
  if (!deepRoot.endsWith("packages/syntax")) {
    console.error(`   ERROR: Expected to find syntax package, got ${deepRoot}`);
    process.exit(1);
  }
  console.log(`   From packages/syntax/src/core → ${path.basename(deepRoot)}`);
  console.log("   PASS\n");

  console.log("==========================");
  console.log("All tests passed!");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});

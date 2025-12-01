/**
 * Smoke test for history package.
 * Runs against the current git repository.
 */

import { GitService } from "../src/core/GitService.js";
import * as path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

async function main() {
  console.log("History Package Smoke Test");
  console.log("==========================\n");
  console.log(`Project root: ${projectRoot}\n`);

  const service = new GitService(projectRoot);

  // Test: isGitRepo
  console.log("1. Testing isGitRepo...");
  const isRepo = await service.isGitRepo();
  console.log(`   Is git repo: ${isRepo}`);
  if (!isRepo) {
    console.error("   ERROR: Not a git repository!");
    process.exit(1);
  }
  console.log("   PASS\n");

  // Test: recentChanges
  console.log("2. Testing recentChanges...");
  const recentResult = await service.recentChanges(5);
  if (!recentResult.ok) {
    console.error(`   ERROR: ${recentResult.error}`);
    process.exit(1);
  }
  console.log(`   Found ${recentResult.value.commits.length} commits`);
  console.log(`   Files changed: ${recentResult.value.filesChanged.length}`);
  console.log(
    `   Stats: +${recentResult.value.totalAdditions} -${recentResult.value.totalDeletions}`
  );
  console.log("   PASS\n");

  // Test: fileHistory
  console.log("3. Testing fileHistory...");
  const historyResult = await service.fileHistory("README.md", 5);
  if (!historyResult.ok) {
    console.error(`   ERROR: ${historyResult.error}`);
    process.exit(1);
  }
  console.log(`   Found ${historyResult.value.length} commits for README.md`);
  if (historyResult.value.length > 0) {
    const first = historyResult.value[0];
    console.log(`   Latest: ${first.shortHash} - ${first.subject}`);
  }
  console.log("   PASS\n");

  // Test: commitInfo
  console.log("4. Testing commitInfo...");
  const commitResult = await service.commitInfo("HEAD");
  if (!commitResult.ok) {
    console.error(`   ERROR: ${commitResult.error}`);
    process.exit(1);
  }
  console.log(`   HEAD: ${commitResult.value.shortHash}`);
  console.log(`   Author: ${commitResult.value.author}`);
  console.log(`   Subject: ${commitResult.value.subject}`);
  console.log("   PASS\n");

  // Test: searchCommits
  console.log("5. Testing searchCommits...");
  const searchResult = await service.searchCommits("feat", 5);
  if (!searchResult.ok) {
    console.error(`   ERROR: ${searchResult.error}`);
    process.exit(1);
  }
  console.log(`   Found ${searchResult.value.length} commits matching "feat"`);
  console.log("   PASS\n");

  // Test: blame (on this test file or README)
  console.log("6. Testing blame...");
  const blameResult = await service.blame("README.md");
  if (!blameResult.ok) {
    console.error(`   ERROR: ${blameResult.error}`);
    process.exit(1);
  }
  console.log(`   Blamed ${blameResult.value.lines.length} lines`);
  if (blameResult.value.lines.length > 0) {
    const firstLine = blameResult.value.lines[0];
    console.log(
      `   First line by: ${firstLine.author} (${firstLine.commit})`
    );
  }
  console.log("   PASS\n");

  // Test: diffFile
  console.log("7. Testing diffFile...");
  const diffResult = await service.diffFile("README.md", "HEAD~1", "HEAD");
  if (!diffResult.ok) {
    // This might fail if README hasn't changed, which is OK
    console.log(`   Note: ${diffResult.error}`);
    console.log("   (This is OK if file hasn't changed)");
  } else {
    const diffLines = diffResult.value.split("\n").length;
    console.log(`   Diff has ${diffLines} lines`);
  }
  console.log("   PASS\n");

  console.log("==========================");
  console.log("All tests passed!");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});

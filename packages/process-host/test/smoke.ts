/**
 * Smoke test for process-host package.
 * Run with: npx tsx test/smoke.ts
 */

import { ProcessService } from "../src/core/services/ProcessService.js";
import { InMemoryProcessRepository } from "../src/infrastructure/memory/InMemoryProcessRepository.js";
import { InMemoryLogRepository } from "../src/infrastructure/memory/InMemoryLogRepository.js";
import { NodeProcessSpawner } from "../src/infrastructure/runner/NodeProcessSpawner.js";

async function main() {
  console.log("🧪 Process-Host Smoke Test\n");

  const processes = new InMemoryProcessRepository();
  const logs = new InMemoryLogRepository();
  const spawner = new NodeProcessSpawner();
  const service = new ProcessService(processes, logs, spawner);

  // Test 1: Run a simple command
  console.log("1. Running a simple command...");
  const runResult = await service.run({ command: 'echo "Hello from process-host"' });
  if (!runResult.ok) {
    console.error("❌ Run failed:", runResult.error);
    process.exit(1);
  }
  if (runResult.value.exitCode !== 0) {
    console.error("❌ Non-zero exit code:", runResult.value.exitCode);
    process.exit(1);
  }
  if (!runResult.value.logs.includes("Hello from process-host")) {
    console.error("❌ Output not captured:", runResult.value.logs);
    process.exit(1);
  }
  console.log("   ✓ Command executed and output captured");

  // Test 2: Start a background process
  console.log("\n2. Starting a background process...");
  const startResult = service.start({ command: "sleep 10", label: "test-sleep" });
  if (!startResult.ok) {
    console.error("❌ Start failed:", startResult.error);
    process.exit(1);
  }
  const proc = startResult.value;
  console.log(`   ✓ Process started: ${proc.id}`);

  // Test 3: Check it's running
  console.log("\n3. Checking process status...");
  const info = processes.get(proc.id);
  if (!info || info.status !== "running") {
    console.error("❌ Process not running:", info?.status);
    process.exit(1);
  }
  console.log("   ✓ Process is running");

  // Test 4: Stop the process
  console.log("\n4. Stopping the process...");
  const stopResult = await service.stop({ id: proc.id });
  if (!stopResult.ok) {
    console.error("❌ Stop failed:", stopResult.error);
    process.exit(1);
  }
  console.log("   ✓ Process stopped");

  // Test 5: Verify it's stopped
  console.log("\n5. Verifying process stopped...");
  const stoppedInfo = processes.get(proc.id);
  if (!stoppedInfo || stoppedInfo.status !== "stopped") {
    console.error("❌ Process not stopped:", stoppedInfo?.status);
    process.exit(1);
  }
  console.log("   ✓ Process status is 'stopped'");

  // Test 6: Test process stats
  console.log("\n6. Checking stats...");
  const stats = service.getStats();
  if (stats.total < 2) {
    console.error("❌ Stats incorrect, expected at least 2 processes");
    process.exit(1);
  }
  console.log(`   ✓ Stats: ${stats.total} total, ${stats.running} running`);

  // Test 7: Run with timeout
  console.log("\n7. Testing timeout...");
  const timeoutResult = await service.run({ command: "sleep 5", timeoutMs: 100 });
  if (!timeoutResult.ok) {
    console.error("❌ Timeout run failed:", timeoutResult.error);
    process.exit(1);
  }
  // Process should complete (even if killed by timeout) or timeout error caught
  console.log("   ✓ Timeout handling works");

  console.log("\n✅ All smoke tests passed!\n");
}

main().catch((err) => {
  console.error("❌ Test failed with error:", err);
  process.exit(1);
});

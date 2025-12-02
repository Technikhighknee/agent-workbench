/**
 * @agent-workbench/task-runner
 *
 * Minimal, robust task execution for AI agents.
 *
 * @example
 * ```typescript
 * import { TaskRunner } from "@agent-workbench/task-runner";
 *
 * const runner = new TaskRunner({ dbPath: "tasks.db" });
 *
 * // Run and wait
 * const result = await runner.run("npm test", { timeout: 60_000 });
 * console.log(result.task.status, result.task.output);
 *
 * // Background task
 * const task = runner.spawn("npm run dev", { label: "dev server" });
 * await runner.waitFor(task.id, { pattern: /listening/ });
 *
 * // Cleanup
 * await runner.shutdown();
 * ```
 */

// Core types
export type {
  Task,
  TaskStatus,
  RunOptions,
  SpawnOptions,
  RunResult,
  WaitOptions,
  WaitResult,
  TaskRunnerConfig,
} from "./model.js";

export {
  DEFAULT_CONFIG,
  DEFAULT_RUN_TIMEOUT,
  DEFAULT_WAIT_TIMEOUT,
  DEFAULT_POLL_INTERVAL,
} from "./model.js";

// Main service
export { TaskRunner } from "./TaskRunner.js";

// Storage (for advanced usage)
export { TaskStore } from "./TaskStore.js";

// Output utilities
export { cleanOutput, compactOutput, truncateOutput, processOutput } from "./cleanOutput.js";

// Tool exports
export { registerAllTools, type Services } from "./tools/index.js";

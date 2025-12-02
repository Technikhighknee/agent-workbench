/**
 * @agent-workbench/task-runner
 *
 * Robust task execution for AI agents with detached processes.
 * Processes survive MCP server restarts.
 *
 * @example
 * ```typescript
 * import { TaskRunner } from "@agent-workbench/task-runner";
 *
 * const runner = new TaskRunner({ dataDir: ".task-runner" });
 * await runner.initialize();
 *
 * // Run and wait
 * const result = await runner.run("npm test", { timeout: 60_000 });
 * console.log(result.task.status, result.output);
 *
 * // Background task (survives server restart)
 * const task = runner.start("npm run dev", { label: "dev server" });
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
  StartOptions,
  RunOptions,
  RunResult,
  WaitOptions,
  WaitResult,
  TaskRunnerConfig,
  CleanupResult,
  ActiveTask,
} from "./model.js";

export {
  DEFAULT_CONFIG,
  DEFAULT_RUN_TIMEOUT,
  DEFAULT_WAIT_TIMEOUT,
} from "./model.js";

// Main service
export { TaskRunner } from "./TaskRunner.js";

// Output utilities
export { cleanOutput, compactOutput, truncateOutput, processOutput } from "./cleanOutput.js";

// Tool exports
export { registerAllTools, type Services } from "./tools/index.js";

#!/usr/bin/env node
/**
 * MCP server for task execution.
 *
 * Robust task runner with detached processes and JSON persistence.
 * Processes survive MCP server restarts.
 */

import { runServer } from "@agent-workbench/core";
import { TaskRunner } from "./TaskRunner.js";
import { registerAllTools, type Services } from "./tools/index.js";

// Data directory from environment or default
const dataDir = process.env.TASK_RUNNER_DATA_DIR ?? ".task-runner";

runServer<Services>({
  config: {
    name: "agent-workbench:task-runner",
    version: "0.1.0",
  },
  createServices: () => ({
    runner: new TaskRunner({ dataDir }),
  }),
  registerTools: registerAllTools,
  onStartup: async (services) => {
    // Initialize the runner (create directories, load tasks, acquire lock)
    await services.runner.initialize();

    const running = services.runner.runningCount();
    if (running > 0) {
      console.error(`[task-runner] Reconnected to ${running} running task(s)`);
    }
    console.error(`[task-runner] Ready. Data directory: ${dataDir}`);
  },
  onShutdown: async (services) => {
    console.error("[task-runner] Shutting down...");
    await services.runner.shutdown();
    console.error("[task-runner] Shutdown complete.");
  },
});

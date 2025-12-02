#!/usr/bin/env node
/**
 * MCP server for task execution.
 *
 * Minimal, robust task runner with SQLite persistence.
 */

import { runServer } from "@agent-workbench/core";
import { TaskRunner } from "./TaskRunner.js";
import { registerAllTools, type Services } from "./tools/index.js";

// Database path from environment or default
const dbPath = process.env.TASK_RUNNER_DB ?? "tasks.db";

runServer<Services>({
  config: {
    name: "agent-workbench:task-runner",
    version: "0.1.0",
  },
  createServices: () => ({
    runner: new TaskRunner({ dbPath }),
  }),
  registerTools: registerAllTools,
  onStartup: async (services) => {
    const running = services.runner.runningCount();
    if (running > 0) {
      console.error(`[task-runner] Warning: Found ${running} orphaned task(s) from previous run`);
    }
    console.error(`[task-runner] Ready. Database: ${dbPath}`);
  },
  onShutdown: async (services) => {
    console.error("[task-runner] Shutting down...");
    await services.runner.shutdown();
    console.error("[task-runner] Shutdown complete.");
  },
});

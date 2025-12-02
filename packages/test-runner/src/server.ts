#!/usr/bin/env node
/**
 * MCP server for test running operations.
 */

import { runServer } from "@agent-workbench/core";
import { TestRunnerServiceImpl } from "./infrastructure/TestRunnerServiceImpl.js";
import { registerAllTools, Services } from "./tools/index.js";

runServer<Services>({
  config: {
    name: "agent-workbench:test-runner",
    version: "0.1.0",
  },
  createServices: () => ({
    testRunner: new TestRunnerServiceImpl(),
  }),
  registerTools: registerAllTools,
  onStartup: async (services) => {
    const rootPath = process.cwd();
    const result = await services.testRunner.initialize(rootPath);

    if (result.ok) {
      console.error(`[test-runner] Initialized: ${result.value.framework} framework detected`);
      console.error(`[test-runner] Config: ${result.value.configFile}`);
    } else {
      console.error(`[test-runner] Warning: ${result.error.message}`);
      console.error(`[test-runner] Test runner will not be available until a supported framework is detected.`);
    }
  },
});

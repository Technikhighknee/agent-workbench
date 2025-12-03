#!/usr/bin/env node
/**
 * MCP server for code insight operations.
 *
 * Provides comprehensive understanding of files, directories, and symbols
 * in a single call - synthesizing structure, relationships, and history.
 */

import { runServer } from "@agent-workbench/core";
import { InsightService } from "./InsightService.js";
import { registerAllTools, Services } from "./tools/index.js";

runServer<Services>({
  config: {
    name: "agent-workbench:insight",
    version: "0.1.0",
  },
  createServices: () => ({
    insight: new InsightService(process.cwd()),
  }),
  registerTools: registerAllTools,
  onStartup: async (services) => {
    // Initialize the insight service (indexes the project)
    await services.insight.initialize();
  },
});

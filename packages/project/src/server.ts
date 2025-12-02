#!/usr/bin/env node
/**
 * MCP server for project metadata operations.
 */

import { runServer } from "@agent-workbench/core";
import { ProjectService } from "./core/ProjectService.js";
import { registerAllTools, Services } from "./tools/index.js";

runServer<Services>({
  config: {
    name: "agent-workbench:project",
    version: "0.1.0",
  },
  createServices: () => ({
    project: new ProjectService(process.cwd()),
  }),
  registerTools: registerAllTools,
});

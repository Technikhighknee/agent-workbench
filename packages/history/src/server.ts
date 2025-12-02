#!/usr/bin/env node
/**
 * MCP server for git history operations.
 */

import { runServer } from "@agent-workbench/core";
import { GitService } from "./core/GitService.js";
import { registerAllTools, Services } from "./tools/index.js";

runServer<Services>({
  config: {
    name: "agent-workbench:history",
    version: "0.1.0",
  },
  createServices: () => ({
    git: new GitService(process.cwd()),
  }),
  registerTools: registerAllTools,
});

/**
 * MCP tool registration for task-runner.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";

import { registerRun } from "./run.js";
import { registerStart } from "./start.js";
import { registerGet } from "./get.js";
import { registerKill } from "./kill.js";
import { registerList } from "./list.js";

export interface Services {
  runner: TaskRunner;
}

export function registerAllTools(server: McpServer, services: Services): void {
  const { runner } = services;

  registerRun(server, runner);
  registerStart(server, runner);
  registerGet(server, runner);
  registerKill(server, runner);
  registerList(server, runner);
}

/**
 * MCP tool registration for insight package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { InsightService } from "../InsightService.js";

import { registerInsight } from "./insight.js";
import { registerSuggestRefactoring } from "./suggestRefactoring.js";

export interface Services {
  insight: InsightService;
}

/**
 * Register all insight tools with an MCP server.
 */
export function registerAllTools(server: McpServer, services: Services): void {
  const { insight } = services;

  registerInsight(server, insight);
  registerSuggestRefactoring(server, insight);
}

export * from "./types.js";

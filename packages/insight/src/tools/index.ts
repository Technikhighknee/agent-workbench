/**
 * MCP tool registration for insight package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { InsightService } from "../InsightService.js";

import { registerInsight } from "./insight.js";

export interface Services {
  insight: InsightService;
}

/**
 * Register all insight tools with an MCP server.
 */
export function registerAllTools(server: McpServer, services: Services): void {
  const { insight } = services;

  registerInsight(server, insight);
}

export * from "./types.js";

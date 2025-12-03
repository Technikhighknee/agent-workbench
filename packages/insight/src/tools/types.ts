/**
 * Tool registration types for insight package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { InsightService } from "../InsightService.js";

export type ToolRegistrar = (server: McpServer, service: InsightService) => void;

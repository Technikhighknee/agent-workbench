/**
 * Shared types for project tool registration.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectService } from "../core/ProjectService.js";

/**
 * Function type for registering a tool with an MCP server.
 */
export interface ToolRegistrar {
  (server: McpServer, service: ProjectService): void;
}

/**
 * Response type for tool handlers.
 */
export type ToolResponse<T extends Record<string, unknown>> = {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: T;
};

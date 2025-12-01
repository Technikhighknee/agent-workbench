/**
 * Shared types for history tool registration.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitService } from "../core/GitService.js";

/**
 * Function type for registering a tool with an MCP server.
 */
export interface ToolRegistrar {
  (server: McpServer, service: GitService): void;
}

/**
 * Response type for tool handlers.
 */
export type ToolResponse<T extends Record<string, unknown>> = {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: T;
};

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ServiceResponse<T> = SuccessResponse<T> | ErrorResponse;

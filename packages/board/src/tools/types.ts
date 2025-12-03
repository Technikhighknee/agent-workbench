/**
 * Shared types for board tool registration.
 */

import type { McpServer } from "@agent-workbench/core";
import type { BoardService } from "../core/BoardService.js";

/**
 * Function type for registering a tool with an MCP server.
 */
export interface ToolRegistrar {
  (server: McpServer, service: BoardService): void;
}

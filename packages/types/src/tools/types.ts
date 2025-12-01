import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeService } from "../core/ports/TypeService.js";

export interface ToolRegistrar {
  (server: McpServer, service: TypeService): void;
}

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

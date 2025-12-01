/**
 * MCP (Model Context Protocol) response utilities.
 * Helpers for creating consistent tool responses.
 */

import type { Result } from "./result.js";

/**
 * MCP text content block.
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * MCP tool response structure.
 */
export interface ToolResponse<T = unknown> {
  content: TextContent[];
  structuredContent?: T;
}

/**
 * Create a simple text response.
 */
export function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

/**
 * Create an error response from a string message.
 */
export function errorResponse(message: string): ToolResponse<{ success: false; error: string }> {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    structuredContent: { success: false, error: message },
  };
}

/**
 * Create a success response with text and optional structured content.
 */
export function successResponse<T extends Record<string, unknown>>(
  text: string,
  data?: T
): ToolResponse<T & { success: true }> {
  return {
    content: [{ type: "text", text }],
    structuredContent: data ? { success: true, ...data } : ({ success: true } as T & { success: true }),
  };
}

/**
 * Convert a Result to an MCP tool response.
 * On success, calls the formatter function.
 * On error, returns an error response.
 */
export function resultToResponse<T, E extends string | Error>(
  result: Result<T, E>,
  formatter: (value: T) => ToolResponse
): ToolResponse {
  if (result.ok) {
    return formatter(result.value);
  }
  const message = result.error instanceof Error ? result.error.message : String(result.error);
  return errorResponse(message);
}

/**
 * Convert a Result to an MCP tool response with structured data.
 * On success, calls the formatter to generate text and structured content.
 * On error, returns an error response.
 */
export function resultToStructuredResponse<T, E extends string | Error, S extends Record<string, unknown>>(
  result: Result<T, E>,
  formatter: (value: T) => { text: string; data: S }
): ToolResponse<S & { success: true } | { success: false; error: string }> {
  if (result.ok) {
    const { text, data } = formatter(result.value);
    return {
      content: [{ type: "text", text }],
      structuredContent: { success: true, ...data },
    };
  }
  const message = result.error instanceof Error ? result.error.message : String(result.error);
  return errorResponse(message);
}

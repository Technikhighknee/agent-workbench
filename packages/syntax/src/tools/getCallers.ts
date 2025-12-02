import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";
import type { CallSite } from "../core/model.js";

interface GetCallersInput {
  symbol_name: string;
}

interface GetCallersOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  callers?: CallSite[];
  count?: number;
}

export function registerGetCallers(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "get_callers",
    {
      title: "Get callers",
      description: `Find all functions/methods that call a given symbol.

Requires index_project to be called first. Searches for calls to the
specified function or method across all indexed files.

Use cases:
- Understand impact before refactoring a function
- Find all entry points that use a particular utility
- Trace data flow backwards through the codebase`,
      inputSchema: {
        symbol_name: z.string().describe("Name of the function/method to find callers for"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        callers: z
          .array(
            z.object({
              filePath: z.string(),
              line: z.number(),
              column: z.number(),
              fromSymbol: z.string().optional(),
              context: z.string(),
            })
          )
          .optional(),
        count: z.number().optional(),
      },
    },
    async (input: GetCallersInput): Promise<ToolResponse<GetCallersOutput>> => {
      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: { success: false, error: "No project indexed" },
        };
      }

      const result = await index.getCallers(input.symbol_name);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const callers = result.value;

      if (callers.length === 0) {
        return {
          content: [{ type: "text", text: `No callers found for: ${input.symbol_name}` }],
          structuredContent: { success: true, callers: [], count: 0 },
        };
      }

      const lines: string[] = [`# Callers of ${input.symbol_name} (${callers.length})`];
      for (const caller of callers) {
        const from = caller.fromSymbol ? ` in ${caller.fromSymbol}` : "";
        lines.push(`- ${caller.filePath}:${caller.line}${from}`);
        lines.push(`  ${caller.context}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, callers, count: callers.length },
      };
    }
  );
}

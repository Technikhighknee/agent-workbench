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
  symbolName?: string;
  callerCount?: number;
  callers?: Array<{
    file: string;
    line: number;
    callingFunction: string;
    context: string;
  }>;
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
        symbolName: z.string().optional(),
        callerCount: z.number().optional(),
        callers: z
          .array(
            z.object({
              file: z.string(),
              line: z.number(),
              callingFunction: z.string(),
              context: z.string(),
            })
          )
          .optional(),
      },
    },
    async (input: GetCallersInput): Promise<ToolResponse<GetCallersOutput>> => {
      const { symbol_name } = input;

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      const result = await index.getCallers(symbol_name);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: {
            success: false,
            error: result.error,
          },
        };
      }

      const callers = result.value;
      const formattedCallers = callers.map((c) => ({
        file: c.filePath,
        line: c.line,
        callingFunction: c.fromSymbol || "unknown",
        context: c.context,
      }));

      // Format text output
      const lines: string[] = [
        `Found ${callers.length} caller(s) of "${symbol_name}"`,
        "",
      ];

      if (callers.length > 0) {
        for (const caller of callers) {
          lines.push(`  ${caller.fromSymbol || "?"} (${caller.filePath}:${caller.line})`);
          lines.push(`    ${caller.context}`);
        }
      } else {
        lines.push("  No callers found.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          symbolName: symbol_name,
          callerCount: callers.length,
          callers: formattedCallers,
        },
      };
    }
  );
}

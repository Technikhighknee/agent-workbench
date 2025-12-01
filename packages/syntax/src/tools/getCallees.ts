import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";
import type { CallSite } from "../core/model.js";

interface GetCalleesInput {
  file_path: string;
  symbol_name_path: string;
}

interface GetCalleesOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  symbolNamePath?: string;
  calleeCount?: number;
  callees?: Array<{
    name: string;
    line: number;
    context: string;
  }>;
}

export function registerGetCallees(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "get_callees",
    {
      title: "Get callees",
      description: `Find all functions/methods called by a given symbol.

Requires index_project to be called first. Analyzes the body of the
specified function or method to find all function calls it makes.

Use cases:
- Understand what a function depends on
- Trace data flow forward through the codebase
- Find dependencies before extracting/refactoring code`,
      inputSchema: {
        file_path: z.string().describe("Path to the file containing the symbol"),
        symbol_name_path: z
          .string()
          .describe("Name path of the function/method (e.g., 'MyClass/myMethod' or 'myFunction')"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        symbolNamePath: z.string().optional(),
        calleeCount: z.number().optional(),
        callees: z
          .array(
            z.object({
              name: z.string(),
              line: z.number(),
              context: z.string(),
            })
          )
          .optional(),
      },
    },
    async (input: GetCalleesInput): Promise<ToolResponse<GetCalleesOutput>> => {
      const { file_path, symbol_name_path } = input;

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      const result = await index.getCallees(file_path, symbol_name_path);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: {
            success: false,
            error: result.error,
          },
        };
      }

      const callees = result.value;
      const formattedCallees = callees.map((c) => ({
        name: c.fromSymbol || "unknown",
        line: c.line,
        context: c.context,
      }));

      // Format text output
      const lines: string[] = [
        `"${symbol_name_path}" calls ${callees.length} function(s)`,
        "",
      ];

      if (callees.length > 0) {
        for (const callee of callees) {
          lines.push(`  ${callee.fromSymbol || "?"}() - line ${callee.line}`);
          lines.push(`    ${callee.context}`);
        }
      } else {
        lines.push("  No function calls found.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          symbolNamePath: symbol_name_path,
          calleeCount: callees.length,
          callees: formattedCallees,
        },
      };
    }
  );
}

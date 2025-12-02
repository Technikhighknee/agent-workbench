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
  callees?: CallSite[];
  count?: number;
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
        symbol_name_path: z.string().describe("Name path of the function/method (e.g., 'MyClass/myMethod' or 'myFunction')"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        callees: z
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
    async (input: GetCalleesInput): Promise<ToolResponse<GetCalleesOutput>> => {
      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: { success: false, error: "No project indexed" },
        };
      }

      const result = await index.getCallees(input.file_path, input.symbol_name_path);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const callees = result.value;

      if (callees.length === 0) {
        return {
          content: [{ type: "text", text: `No callees found for: ${input.symbol_name_path}` }],
          structuredContent: { success: true, callees: [], count: 0 },
        };
      }

      const lines: string[] = [`# Callees of ${input.symbol_name_path} (${callees.length})`];
      for (const callee of callees) {
        lines.push(`- L${callee.line}: ${callee.fromSymbol ?? "unknown"}`);
        lines.push(`  ${callee.context}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, callees, count: callees.length },
      };
    }
  );
}

/**
 * get_quick_fixes - Get suggested fixes for errors at a position.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeChecker } from "../TypeChecker.js";

export function registerGetQuickFixes(server: McpServer, checker: TypeChecker): void {
  server.registerTool(
    "get_quick_fixes",
    {
      title: "Get quick fixes",
      description: `Get available fixes for type errors at a position.

Returns TypeScript's suggested fixes with the exact edits to apply.`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Line number (1-indexed)"),
        column: z.number().describe("Column number (1-indexed)"),
      },
    },
    async ({ file, line, column }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      try {
        const fixes = await checker.getQuickFixes(file, line, column);

        if (fixes.length === 0) {
          return {
            content: [{ type: "text", text: "No quick fixes available" }],
          };
        }

        const lines: string[] = [];
        lines.push(`# ${fixes.length} Quick Fix${fixes.length > 1 ? "es" : ""}`);
        lines.push("");

        for (let i = 0; i < fixes.length; i++) {
          const fix = fixes[i];
          lines.push(`## ${i + 1}. ${fix.title}`);

          for (const edit of fix.edits) {
            lines.push(`**${edit.file}** L${edit.startLine}:${edit.startColumn}`);
            lines.push("```typescript");
            lines.push(edit.newText.trim() || "(delete)");
            lines.push("```");
          }
          lines.push("");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
        };
      }
    }
  );
}

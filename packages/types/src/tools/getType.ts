/**
 * get_type - Get type information at a position.
 *
 * Like hovering in an IDE. Fast and simple.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeChecker } from "../TypeChecker.js";

export function registerGetType(server: McpServer, checker: TypeChecker): void {
  server.registerTool(
    "get_type",
    {
      title: "Get type at position",
      description: `Get type information at a specific position in a TypeScript file.

Like hovering over a symbol in an IDE. Returns type, kind, and documentation.`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Line number (1-indexed)"),
        column: z.number().describe("Column number (1-indexed)"),
      },
    },
    async ({ file, line, column }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      try {
        const info = await checker.getType(file, line, column);

        const lines: string[] = [];
        lines.push("```typescript");
        lines.push(info.type);
        lines.push("```");
        lines.push("");
        lines.push(`**Kind:** ${info.kind}`);

        if (info.documentation) {
          lines.push("");
          lines.push(`**Docs:** ${info.documentation}`);
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

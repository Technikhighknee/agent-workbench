/**
 * go_to_definition - Find where a symbol is defined.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeChecker } from "../TypeChecker.js";

export function registerGoToDefinition(server: McpServer, checker: TypeChecker): void {
  server.registerTool(
    "go_to_definition",
    {
      title: "Go to definition",
      description: `Find where a symbol is defined.

Returns the file and line where a function, class, variable, or type is defined.`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Line number (1-indexed)"),
        column: z.number().describe("Column number (1-indexed)"),
      },
    },
    async ({ file, line, column }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      try {
        const definitions = await checker.getDefinition(file, line, column);

        if (definitions.length === 0) {
          return {
            content: [{ type: "text", text: "No definition found" }],
          };
        }

        const lines: string[] = [];
        for (const def of definitions) {
          lines.push(`**${def.name}** (${def.kind})`);
          lines.push(`📍 ${def.file}:${def.line}:${def.column}`);
          if (def.preview) {
            lines.push("```typescript");
            lines.push(def.preview);
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

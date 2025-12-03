import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { ExportInfo } from "../core/model.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import { ExportInfoSchema } from "./schemas.js";
import type { ToolResponse } from "./types.js";

interface GetExportsInput {
  file_path: string;
}

interface GetExportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  exports?: ExportInfo[];
  count?: number;
}

export function registerGetExports(server: McpServer, service: SyntaxService): void {
  server.registerTool(
    "get_exports",
    {
      title: "Get exports",
      description: `Get all export statements from a source file.

Returns detailed information about each export including:
- Export type (default, named, declaration, reexport, namespace)
- Bindings (what names are exported)
- Re-export source (if applicable)
- Symbol kind for declarations

Use cases:
- Understand a module's public API
- Find what a file exports before importing
- Analyze module boundaries`,
      inputSchema: {
        file_path: z.string().describe("Path to the source file"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        exports: z.array(ExportInfoSchema).optional(),
        count: z.number().optional(),
      },
    },
    async (input: GetExportsInput): Promise<ToolResponse<GetExportsOutput>> => {
      const result = await service.getExports(input.file_path);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const exports = result.value;

      if (exports.length === 0) {
        return {
          content: [{ type: "text", text: "No exports found in this file." }],
          structuredContent: { success: true, exports: [], count: 0 },
        };
      }

      const lines: string[] = [`# Exports (${exports.length})`];
      for (const exp of exports) {
        const bindings = exp.bindings.map((b) => {
          if (b.localName && b.localName !== b.name) {
            return `${b.localName} as ${b.name}`;
          }
          return b.name;
        });

        const bindingStr = bindings.length > 0 ? bindings.join(", ") : "";
        const fromStr = exp.source ? ` from "${exp.source}"` : "";
        lines.push(`- L${exp.line}: ${exp.type}${fromStr} ${bindingStr ? `[${bindingStr}]` : ""}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, exports, count: exports.length },
      };
    }
  );
}

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";
import { ImportInfoSchema } from "./schemas.js";
import type { ImportInfo } from "../core/model.js";

interface GetImportsInput {
  file_path: string;
}

interface GetImportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  imports?: ImportInfo[];
  count?: number;
}

export function registerGetImports(server: McpServer, service: SyntaxService): void {
  server.registerTool(
    "get_imports",
    {
      title: "Get imports",
      description: `Get all import statements from a source file.

Returns detailed information about each import including:
- Source module (where it's imported from)
- Import type (default, named, namespace, side_effect, type)
- Bindings (what names are imported)
- Aliases (if any)

Use cases:
- Understand a file's dependencies
- Find where a module is imported from
- Analyze import patterns before refactoring`,
      inputSchema: {
        file_path: z.string().describe("Path to the source file"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        imports: z.array(ImportInfoSchema).optional(),
        count: z.number().optional(),
      },
    },
    async (input: GetImportsInput): Promise<ToolResponse<GetImportsOutput>> => {
      const result = await service.getImports(input.file_path);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const imports = result.value;

      if (imports.length === 0) {
        return {
          content: [{ type: "text", text: "No imports found in this file." }],
          structuredContent: { success: true, imports: [], count: 0 },
        };
      }

      const lines: string[] = [`# Imports (${imports.length})`];
      for (const imp of imports) {
        const bindings = imp.bindings.map((b) => {
          if (b.originalName && b.originalName !== b.name) {
            return `${b.originalName} as ${b.name}`;
          }
          return b.name;
        });

        const bindingStr = bindings.length > 0 ? bindings.join(", ") : "";
        lines.push(`- L${imp.line}: ${imp.type} from "${imp.source}" ${bindingStr ? `[${bindingStr}]` : ""}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, imports, count: imports.length },
      };
    }
  );
}

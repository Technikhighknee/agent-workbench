import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";

interface FindReferencesInput {
  symbol_name: string;
  definition_file?: string;
}

interface ReferenceOutput {
  file: string;
  line: number;
  column: number;
  context: string;
  type: "definition" | "usage";
}

interface FindReferencesOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  symbol?: string;
  totalReferences?: number;
  definitions?: number;
  usages?: number;
  references?: ReferenceOutput[];
}

export function registerFindReferences(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "find_references",
    {
      title: "Find references",
      description: `Find all usages and references of a symbol throughout the codebase.

Requires index_project to be called first. Uses text-based search for the symbol
name as an identifier (word boundary matching).

Returns a list of all files and locations where the symbol appears, with context.
Distinguishes between definitions and usages.

Use cases:
- Understand how a function/class is used before refactoring
- Find all callers of a method
- Locate where a variable is referenced`,
      inputSchema: {
        symbol_name: z.string().describe("Name of the symbol to find references for"),
        definition_file: z
          .string()
          .optional()
          .describe("Optional: file path where symbol is defined (helps identify definition vs usage)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        symbol: z.string().optional(),
        totalReferences: z.number().optional(),
        definitions: z.number().optional(),
        usages: z.number().optional(),
        references: z
          .array(
            z.object({
              file: z.string(),
              line: z.number(),
              column: z.number(),
              context: z.string(),
              type: z.enum(["definition", "usage"]),
            })
          )
          .optional(),
      },
    },
    async (input: FindReferencesInput): Promise<ToolResponse<FindReferencesOutput>> => {
      const { symbol_name, definition_file } = input;

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      const result = await index.findReferences(symbol_name, definition_file);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: {
            success: false,
            error: result.error,
          },
        };
      }

      const references = result.value;
      const definitions = references.filter((r) => r.isDefinition);
      const usages = references.filter((r) => !r.isDefinition);

      const refOutputs: ReferenceOutput[] = references.map((ref) => ({
        file: ref.filePath,
        line: ref.line,
        column: ref.column,
        context: ref.context,
        type: ref.isDefinition ? "definition" : "usage",
      }));

      // Format text output
      const lines: string[] = [
        `Found ${references.length} references to "${symbol_name}"`,
        `  ${definitions.length} definition(s), ${usages.length} usage(s)`,
        "",
      ];

      if (definitions.length > 0) {
        lines.push("Definitions:");
        for (const def of definitions) {
          lines.push(`  ${def.filePath}:${def.line} - ${def.context}`);
        }
        lines.push("");
      }

      if (usages.length > 0) {
        lines.push("Usages:");
        for (const usage of usages) {
          lines.push(`  ${usage.filePath}:${usage.line} - ${usage.context}`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          symbol: symbol_name,
          totalReferences: references.length,
          definitions: definitions.length,
          usages: usages.length,
          references: refOutputs,
        },
      };
    }
  );
}

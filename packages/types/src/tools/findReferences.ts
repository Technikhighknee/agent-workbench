import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { DefinitionSchema } from "./schemas.js";
import type { Definition } from "../core/model.js";

interface FindReferencesInput {
  file: string;
  line: number;
  column: number;
}

interface FindReferencesOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  references?: Definition[];
  count?: number;
}

export const registerFindReferences: ToolRegistrar = (server, service) => {
  server.registerTool(
    "find_type_references",
    {
      title: "Find references (type-aware)",
      description: `Find all references to a symbol using TypeScript's type system.

More accurate than text-based search because it understands the type system. Only finds actual usages of the specific symbol, not unrelated identifiers with the same name.

Use cases:
- Find all usages of a function before refactoring
- Check if a type is used anywhere
- Understand how a class is instantiated
- Find all calls to a method`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Line number (1-indexed)"),
        column: z.number().describe("Column number (1-indexed)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        references: z.array(DefinitionSchema).optional(),
        count: z.number().optional(),
      },
    },
    async (input: FindReferencesInput): Promise<ToolResponse<FindReferencesOutput>> => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text", text: "Error: TypeScript service not initialized" }],
          structuredContent: { success: false, error: "Service not initialized" },
        };
      }

      const result = service.findReferences({
        file: input.file,
        line: input.line,
        column: input.column,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error.message}` }],
          structuredContent: { success: false, error: result.error.message },
        };
      }

      const references = result.value;

      if (references.length === 0) {
        return {
          content: [{ type: "text", text: "No references found" }],
          structuredContent: { success: true, references: [], count: 0 },
        };
      }

      const formatted = formatReferences(references);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          references,
          count: references.length,
        },
      };
    }
  );
};

function formatReferences(references: Definition[]): string {
  const lines: string[] = [];

  lines.push(`# ${references.length} Reference${references.length > 1 ? "s" : ""} Found`);
  lines.push("");

  // Group by file
  const byFile = new Map<string, Definition[]>();
  for (const ref of references) {
    const existing = byFile.get(ref.file) ?? [];
    existing.push(ref);
    byFile.set(ref.file, existing);
  }

  for (const [file, fileRefs] of byFile) {
    lines.push(`## ${file} (${fileRefs.length})`);
    for (const ref of fileRefs) {
      lines.push(`  L${ref.line}:${ref.column}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

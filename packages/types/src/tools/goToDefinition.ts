import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { DefinitionSchema } from "./schemas.js";
import type { Definition } from "../core/model.js";

interface GoToDefinitionInput {
  file: string;
  line: number;
  column: number;
}

interface GoToDefinitionOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  definitions?: Definition[];
}

export const registerGoToDefinition: ToolRegistrar = (server, service) => {
  server.registerTool(
    "go_to_definition",
    {
      title: "Go to definition",
      description: `Find the definition location of a symbol at a specific position.

Returns where a function, class, variable, or type is defined. Useful for navigating to source code.

Use cases:
- Find where a function is implemented
- Navigate to a type definition
- Jump to a variable's declaration
- Find imported module sources`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Line number (1-indexed)"),
        column: z.number().describe("Column number (1-indexed)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        definitions: z.array(DefinitionSchema).optional(),
      },
    },
    async (input: GoToDefinitionInput): Promise<ToolResponse<GoToDefinitionOutput>> => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text", text: "Error: TypeScript service not initialized" }],
          structuredContent: { success: false, error: "Service not initialized" },
        };
      }

      const result = service.getDefinition({
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

      const definitions = result.value;

      if (definitions.length === 0) {
        return {
          content: [{ type: "text", text: "No definition found at this position" }],
          structuredContent: { success: true, definitions: [] },
        };
      }

      const formatted = formatDefinitions(definitions);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          definitions,
        },
      };
    }
  );
};

function formatDefinitions(definitions: Definition[]): string {
  const lines: string[] = [];

  lines.push(`# Definition${definitions.length > 1 ? "s" : ""} Found`);
  lines.push("");

  for (const def of definitions) {
    lines.push(`## ${def.name} (${def.kind})`);
    lines.push(`📍 ${def.file}:${def.line}:${def.column}`);

    if (def.containerName) {
      lines.push(`📦 Container: ${def.containerName}`);
    }

    if (def.preview) {
      lines.push("");
      lines.push("```typescript");
      lines.push(def.preview);
      lines.push("```");
    }

    lines.push("");
  }

  return lines.join("\n");
}

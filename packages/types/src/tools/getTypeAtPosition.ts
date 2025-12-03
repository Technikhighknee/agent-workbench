import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { TypeInfoSchema } from "./schemas.js";
import type { TypeInfo } from "../core/model.js";

interface GetTypeAtPositionInput {
  file: string;
  line: number;
  column: number;
}

interface GetTypeAtPositionOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  typeInfo?: TypeInfo;
}

export const registerGetTypeAtPosition: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_type_at_position",
    {
      title: "Get type at position",
      description: `Get type information at a specific position in a TypeScript file.

Equivalent to hovering over a symbol in an IDE. Returns the type, documentation, and symbol kind.

Use cases:
- Understand what type a variable has
- See function signatures and return types
- Read JSDoc documentation
- Explore inferred types`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Line number (1-indexed)"),
        column: z.number().describe("Column number (1-indexed)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        typeInfo: TypeInfoSchema.optional(),
      },
    },
    async (input: GetTypeAtPositionInput): Promise<ToolResponse<GetTypeAtPositionOutput>> => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text", text: "Error: TypeScript service not initialized" }],
          structuredContent: { success: false, error: "Service not initialized" },
        };
      }

      const result = await service.getTypeAtPosition({
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

      const typeInfo = result.value;
      const formatted = formatTypeInfo(typeInfo, input);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          typeInfo,
        },
      };
    }
  );
};

function formatTypeInfo(info: TypeInfo, pos: { file: string; line: number; column: number }): string {
  const lines: string[] = [];

  lines.push(`# Type at ${pos.file}:${pos.line}:${pos.column}`);
  lines.push("");
  lines.push("```typescript");
  lines.push(info.type);
  lines.push("```");
  lines.push("");
  lines.push(`**Kind:** ${info.kind}`);

  if (info.documentation) {
    lines.push("");
    lines.push("**Documentation:**");
    lines.push(info.documentation);
  }

  if (info.tags && info.tags.length > 0) {
    lines.push("");
    lines.push("**Tags:**");
    for (const tag of info.tags) {
      lines.push(`- @${tag.name}${tag.text ? `: ${tag.text}` : ""}`);
    }
  }

  return lines.join("\n");
}

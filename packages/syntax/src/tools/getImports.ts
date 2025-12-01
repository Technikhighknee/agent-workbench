import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
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

export const registerGetImports: ToolRegistrar = (server, service) => {
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
      const formatted = formatImports(imports);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          imports,
          count: imports.length,
        },
      };
    }
  );
};

function formatImports(imports: ImportInfo[]): string {
  if (imports.length === 0) {
    return "No imports found";
  }

  const lines: string[] = [];
  lines.push(`Found ${imports.length} import(s):\n`);

  for (const imp of imports) {
    const typeIcon = getTypeIcon(imp.type);
    const bindings = imp.bindings.map((b) => {
      if (b.originalName) {
        return `${b.originalName} as ${b.name}`;
      }
      return b.name;
    }).join(", ");

    const bindingsStr = bindings ? ` { ${bindings} }` : "";
    lines.push(`${typeIcon} L${imp.line}: from "${imp.source}"${bindingsStr}`);
  }

  return lines.join("\n");
}

function getTypeIcon(type: ImportInfo["type"]): string {
  const icons: Record<ImportInfo["type"], string> = {
    default: "📥",
    named: "📦",
    namespace: "📁",
    side_effect: "⚡",
    type: "🏷️",
    require: "📎",
  };
  return icons[type] ?? "•";
}

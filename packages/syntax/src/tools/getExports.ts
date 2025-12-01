import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { ExportInfoSchema } from "./schemas.js";
import type { ExportInfo } from "../core/model.js";

interface GetExportsInput {
  file_path: string;
}

interface GetExportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  exports?: ExportInfo[];
  count?: number;
}

export const registerGetExports: ToolRegistrar = (server, service) => {
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
      const formatted = formatExports(exports);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          exports,
          count: exports.length,
        },
      };
    }
  );
};

function formatExports(exports: ExportInfo[]): string {
  if (exports.length === 0) {
    return "No exports found";
  }

  const lines: string[] = [];
  lines.push(`Found ${exports.length} export(s):\n`);

  for (const exp of exports) {
    const typeIcon = getTypeIcon(exp.type);
    const bindings = exp.bindings.map((b) => {
      let str = b.name;
      if (b.localName && b.localName !== b.name) {
        str = `${b.localName} as ${b.name}`;
      }
      if (b.kind) {
        str += ` (${b.kind})`;
      }
      return str;
    }).join(", ");

    const sourceStr = exp.source ? ` from "${exp.source}"` : "";
    lines.push(`${typeIcon} L${exp.line}: ${bindings}${sourceStr}`);
  }

  return lines.join("\n");
}

function getTypeIcon(type: ExportInfo["type"]): string {
  const icons: Record<ExportInfo["type"], string> = {
    default: "📤",
    named: "📦",
    declaration: "⚡",
    reexport: "🔄",
    namespace: "📁",
  };
  return icons[type] ?? "•";
}

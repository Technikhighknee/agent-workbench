import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { SymbolKindSchema, SymbolInfoSchema } from "./schemas.js";
import type { SymbolInfo, SymbolKind } from "../core/model.js";

interface ListSymbolsInput {
  file_path: string;
  depth?: number;
  kinds?: SymbolKind[];
}

interface ListSymbolsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  symbols?: SymbolInfo[];
  count?: number;
}

export const registerListSymbols: ToolRegistrar = (server, service) => {
  server.registerTool(
    "list_symbols",
    {
      title: "List symbols",
      description: `List all symbols (functions, classes, etc.) in a source file.

INSTEAD OF: Reading entire files to understand structure.

Returns a hierarchical view of code structure - classes contain methods, modules contain functions, etc.

Use cases:
- Understand file structure before reading code
- Find the function/class you need to edit
- Get an overview of what's in a file`,
      inputSchema: {
        file_path: z.string().describe("Path to the source file"),
        depth: z.number().optional().describe("How deep to traverse (0 = top-level only, undefined = all)"),
        kinds: z.array(SymbolKindSchema).optional().describe("Filter by symbol kinds (e.g., ['function', 'class'])"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        symbols: z.array(SymbolInfoSchema).optional(),
        count: z.number().optional(),
      },
    },
    async (input: ListSymbolsInput): Promise<ToolResponse<ListSymbolsOutput>> => {
      const result = await service.listSymbols({
        filePath: input.file_path,
        depth: input.depth,
        kinds: input.kinds,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const symbols = result.value;
      const formatted = formatSymbolTree(symbols);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          symbols,
          count: countSymbols(symbols),
        },
      };
    }
  );
};

function formatSymbolTree(symbols: SymbolInfo[], indent = 0): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const symbol of symbols) {
    const kindIcon = getKindIcon(symbol.kind);
    lines.push(`${prefix}${kindIcon} ${symbol.name} (${symbol.kind}) L${symbol.line}-${symbol.endLine}`);

    if (symbol.children && symbol.children.length > 0) {
      lines.push(formatSymbolTree(symbol.children, indent + 1));
    }
  }

  return lines.join("\n");
}

function getKindIcon(kind: SymbolKind): string {
  const icons: Record<SymbolKind, string> = {
    file: "📄",
    class: "🔷",
    interface: "🔶",
    function: "⚡",
    method: "🔹",
    property: "📌",
    variable: "📦",
    constant: "🔒",
    enum: "📋",
    enum_member: "▪️",
    type_alias: "🏷️",
    namespace: "📁",
    module: "📦",
    constructor: "🔨",
    field: "📍",
    parameter: "📎",
    import: "📥",
  };
  return icons[kind] ?? "•";
}

function countSymbols(symbols: SymbolInfo[]): number {
  let count = symbols.length;
  for (const symbol of symbols) {
    if (symbol.children) {
      count += countSymbols(symbol.children);
    }
  }
  return count;
}

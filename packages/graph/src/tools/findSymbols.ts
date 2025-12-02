/**
 * graph_find_symbols - Search for symbols by pattern or kind.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Node, SymbolKind } from "../model.js";

const InputSchema = {
  pattern: z.string().optional().describe("Regex pattern to match symbol names"),
  kinds: z
    .array(z.string())
    .optional()
    .describe("Filter by symbol kinds"),
  limit: z.number().optional().describe("Maximum results"),
};

function formatSymbols(symbols: Node[]): string {
  if (symbols.length === 0) {
    return "No symbols found matching criteria";
  }

  const lines = [`## Found ${symbols.length} symbol(s)`, ""];

  // Group by kind
  const byKind = new Map<string, Node[]>();
  for (const symbol of symbols) {
    if (!byKind.has(symbol.kind)) {
      byKind.set(symbol.kind, []);
    }
    byKind.get(symbol.kind)!.push(symbol);
  }

  for (const [kind, nodes] of byKind) {
    lines.push(`### ${kind} (${nodes.length})`);
    lines.push("");
    for (const node of nodes.slice(0, 20)) {
      lines.push(`- **${node.qualifiedName}** - ${node.file}:${node.line}`);
    }
    if (nodes.length > 20) {
      lines.push(`  ... and ${nodes.length - 20} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function registerFindSymbols(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_find_symbols",
    {
      title: "Find symbols",
      description:
        "Search for symbols by pattern, tags, or kind. Use tags like 'handler', 'validation', 'database', 'async'.",
      inputSchema: InputSchema,
    },
    async (input) => {
      const { pattern, kinds, limit } = input as {
        pattern?: string;
        kinds?: string[];
        limit?: number;
      };

      if (store.isEmpty()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Graph not initialized. Call graph_initialize first.",
            },
          ],
          isError: true,
        };
      }

      const regex = pattern ? new RegExp(pattern, "i") : /.*/;
      const symbolKinds = kinds as SymbolKind[] | undefined;
      const symbols = store.findSymbols(regex, symbolKinds, limit ?? 100);

      return {
        content: [{ type: "text" as const, text: formatSymbols(symbols) }],
      };
    }
  );
}

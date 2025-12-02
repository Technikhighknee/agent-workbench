/**
 * graph_get_callers - Find all callers of a symbol.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Node } from "../model.js";

const InputSchema = {
  symbol: z.string().describe("Symbol name to find callers for"),
};

function formatCallers(symbol: string, callers: Node[]): string {
  if (callers.length === 0) {
    return `No callers found for: ${symbol}`;
  }

  const lines = [`## Callers of ${symbol}`, "", `Found ${callers.length} caller(s):`, ""];

  for (const caller of callers) {
    lines.push(`### ${caller.qualifiedName}`);
    lines.push(`**File:** ${caller.file}:${caller.line}`);
    lines.push("");
    lines.push("```");
    // Show first 20 lines of source
    const sourceLines = caller.source.split("\n");
    lines.push(sourceLines.slice(0, 20).join("\n"));
    if (sourceLines.length > 20) {
      lines.push(`... (${sourceLines.length - 20} more lines)`);
    }
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

export function registerGetCallers(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_get_callers",
    {
      title: "Get callers",
      description:
        "Find all functions/methods that call a given symbol. Returns caller nodes with source.",
      inputSchema: InputSchema,
    },
    async (input) => {
      const { symbol } = input as { symbol: string };

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

      // Find the symbol first
      const matches = store.findSymbols(new RegExp(symbol, "i"), undefined, 10);
      if (matches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Symbol not found: ${symbol}` }],
          isError: true,
        };
      }

      // Get callers for first match
      const target = matches[0];
      const callers = store.getCallers(target.id);

      return {
        content: [{ type: "text" as const, text: formatCallers(symbol, callers) }],
      };
    }
  );
}

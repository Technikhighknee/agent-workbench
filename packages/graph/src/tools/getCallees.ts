/**
 * graph_get_callees - Find all callees of a symbol.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Node } from "../model.js";

const InputSchema = {
  symbol: z.string().describe("Symbol name to find callees for"),
};

function formatCallees(symbol: string, callees: Node[]): string {
  if (callees.length === 0) {
    return `No callees found for: ${symbol}`;
  }

  const lines = [`## Callees of ${symbol}`, "", `Found ${callees.length} callee(s):`, ""];

  for (const callee of callees) {
    lines.push(`### ${callee.qualifiedName}`);
    lines.push(`**File:** ${callee.file}:${callee.line}`);
    lines.push("");
    lines.push("```");
    // Show first 20 lines of source
    const sourceLines = callee.source.split("\n");
    lines.push(sourceLines.slice(0, 20).join("\n"));
    if (sourceLines.length > 20) {
      lines.push(`... (${sourceLines.length - 20} more lines)`);
    }
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

export function registerGetCallees(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_get_callees",
    {
      title: "Get callees",
      description:
        "Find all functions/methods called by a given symbol. Returns callee nodes with source.",
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

      // Get callees for first match
      const target = matches[0];
      const callees = store.getCallees(target.id);

      return {
        content: [{ type: "text" as const, text: formatCallees(symbol, callees) }],
      };
    }
  );
}

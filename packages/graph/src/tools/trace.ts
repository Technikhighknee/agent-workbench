/**
 * graph_trace - Trace call chains forward or backward.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Node } from "../model.js";

const InputSchema = {
  symbol: z.string().describe("Starting symbol"),
  direction: z.enum(["forward", "backward"]).describe("Trace direction"),
  depth: z.number().optional().describe("Maximum depth (default: 5)"),
};

function formatTrace(symbol: string, direction: string, nodes: Node[]): string {
  if (nodes.length === 0) {
    return `No ${direction} trace found for: ${symbol}`;
  }

  const arrow = direction === "forward" ? "→" : "←";
  const lines = [
    `## ${direction === "forward" ? "Forward" : "Backward"} Trace from ${symbol}`,
    "",
    `Found ${nodes.length} reachable symbol(s):`,
    "",
  ];

  for (const node of nodes) {
    lines.push(`${arrow} **${node.qualifiedName}** (${node.kind})`);
    lines.push(`  File: ${node.file}:${node.line}`);
  }

  return lines.join("\n");
}

export function registerTrace(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_trace",
    {
      title: "Trace calls",
      description:
        "Trace call chains forward (what does this call?) or backward (who calls this?). Returns subgraph.",
      inputSchema: InputSchema,
    },
    async (input) => {
      const { symbol, direction, depth } = input as {
        symbol: string;
        direction: "forward" | "backward";
        depth?: number;
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

      // Find the symbol first
      const matches = store.findSymbols(new RegExp(symbol, "i"), undefined, 10);
      if (matches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Symbol not found: ${symbol}` }],
          isError: true,
        };
      }

      const target = matches[0];
      const traced = store.trace(target.id, direction, depth ?? 5);

      return {
        content: [{ type: "text" as const, text: formatTrace(symbol, direction, traced) }],
      };
    }
  );
}

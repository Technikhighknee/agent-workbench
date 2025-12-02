/**
 * graph_get_symbol - Get full information about a symbol.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Node } from "../model.js";

const InputSchema = {
  name: z.string().describe("Symbol name or qualified name"),
};

function formatNode(node: Node): string {
  const lines = [
    `## ${node.qualifiedName}`,
    "",
    `**Kind:** ${node.kind}`,
    `**File:** ${node.file}:${node.line}`,
    node.isExported ? "**Exported:** Yes" : "",
    node.isAsync ? "**Async:** Yes" : "",
    "",
    "```",
    node.source,
    "```",
  ].filter(Boolean);

  return lines.join("\n");
}

export function registerGetSymbol(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_get_symbol",
    {
      title: "Get symbol",
      description:
        "Get full information about a symbol including its source code. No follow-up Read needed.",
      inputSchema: InputSchema,
    },
    async (input) => {
      const { name } = input as { name: string };

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

      // Try to find by exact ID first
      let node = store.getNode(name);

      // If not found, search by name
      if (!node) {
        const matches = store.findSymbols(new RegExp(`^${name}$`), undefined, 1);
        node = matches[0] ?? null;
      }

      // Try partial match
      if (!node) {
        const matches = store.findSymbols(new RegExp(name, "i"), undefined, 1);
        node = matches[0] ?? null;
      }

      if (!node) {
        return {
          content: [{ type: "text" as const, text: `Symbol not found: ${name}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: formatNode(node) }],
      };
    }
  );
}

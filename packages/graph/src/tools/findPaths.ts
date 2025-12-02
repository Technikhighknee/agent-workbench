/**
 * graph_find_paths - Find all paths between two symbols.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Path } from "../model.js";

const InputSchema = {
  from: z.string().describe("Starting symbol"),
  to: z.string().describe("Target symbol"),
  max_depth: z.number().optional().describe("Maximum path length (default: 10)"),
};

function formatPaths(from: string, to: string, paths: Path[], store: GraphStore): string {
  if (paths.length === 0) {
    return `No paths found from "${from}" to "${to}"`;
  }

  const lines = [
    `## Paths from ${from} to ${to}`,
    "",
    `Found ${paths.length} path(s):`,
    "",
  ];

  for (let i = 0; i < Math.min(paths.length, 10); i++) {
    const path = paths[i];
    lines.push(`### Path ${i + 1} (length: ${path.length})`);
    lines.push("");

    const nodeNames = path.nodes.map((id) => {
      const node = store.getNode(id);
      return node ? node.qualifiedName : id;
    });

    lines.push(nodeNames.join(" → "));
    lines.push("");
  }

  if (paths.length > 10) {
    lines.push(`... and ${paths.length - 10} more paths`);
  }

  return lines.join("\n");
}

export function registerFindPaths(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_find_paths",
    {
      title: "Find paths",
      description:
        "Find all paths between two symbols. Useful for understanding how data/control flows.",
      inputSchema: InputSchema,
    },
    async (input) => {
      const { from, to, max_depth } = input as {
        from: string;
        to: string;
        max_depth?: number;
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

      // Find source symbol
      const fromMatches = store.findSymbols(new RegExp(from, "i"), undefined, 10);
      if (fromMatches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Source symbol not found: ${from}` }],
          isError: true,
        };
      }

      // Find target symbol
      const toMatches = store.findSymbols(new RegExp(to, "i"), undefined, 10);
      if (toMatches.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Target symbol not found: ${to}` }],
          isError: true,
        };
      }

      const paths = store.findPaths(fromMatches[0].id, toMatches[0].id, max_depth ?? 10);

      return {
        content: [{ type: "text" as const, text: formatPaths(from, to, paths, store) }],
      };
    }
  );
}

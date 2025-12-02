/**
 * graph_stats - Get statistics about the indexed graph.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";

export function registerGetStats(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_stats",
    {
      title: "Graph stats",
      description: "Get statistics about the indexed graph: node count, edge count, file count.",
      inputSchema: {},
    },
    async () => {
      if (store.isEmpty()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Graph not initialized. Call graph_initialize first.",
            },
          ],
        };
      }

      const stats = store.stats();

      const lines = [
        "## Graph Statistics",
        "",
        `**Nodes:** ${stats.nodes}`,
        `**Edges:** ${stats.edges}`,
        `**Files:** ${stats.files}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}

/**
 * graph_initialize - Index a workspace for graph queries.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Analyzer } from "../Analyzer.js";

const InputSchema = {
  workspace_path: z.string().describe("Path to the workspace to index"),
};

export function registerInitialize(
  server: McpServer,
  store: GraphStore,
  analyzer: Analyzer
): void {
  server.registerTool(
    "graph_initialize",
    {
      title: "Initialize graph",
      description:
        "Initialize the semantic code graph by indexing a workspace. Call this first before any queries.",
      inputSchema: InputSchema,
    },
    async (input) => {
      const { workspace_path } = input as { workspace_path: string };

      try {
        // Clear existing data
        store.clear();

        // Analyze workspace
        const { nodes, edges } = await analyzer.analyzeWorkspace(workspace_path);

        // Add to store
        store.add(nodes, edges);

        const stats = store.stats();

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `## Graph Initialized`,
                "",
                `**Workspace:** ${workspace_path}`,
                `**Nodes:** ${stats.nodes}`,
                `**Edges:** ${stats.edges}`,
                `**Files:** ${stats.files}`,
                "",
                "Graph is ready for queries.",
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

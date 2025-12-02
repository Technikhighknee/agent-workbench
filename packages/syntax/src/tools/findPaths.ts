/**
 * find_paths - Find all paths between two symbols in the call graph.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";

interface FindPathsInput {
  from: string;
  to: string;
  max_depth?: number;
}

interface FindPathsOutput {
  success: boolean;
  error?: string;
  from?: string;
  to?: string;
  paths?: Array<{
    nodes: string[];
    length: number;
  }>;
  count?: number;
}

export function registerFindPaths(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "find_paths",
    {
      title: "Find call paths",
      description: `Find all paths between two symbols in the call graph.

Useful for understanding how data/control flows from one function to another.

Use cases:
- Understand how user input reaches a database query
- Find all ways function A can call function B
- Trace execution paths through the codebase

Example: find_paths("handleRequest", "saveToDatabase") shows all call chains.`,
      inputSchema: {
        from: z.string().describe("Starting symbol name"),
        to: z.string().describe("Target symbol name"),
        max_depth: z.number().int().min(1).max(15).optional().describe("Maximum path length (default: 10)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        paths: z
          .array(
            z.object({
              nodes: z.array(z.string()),
              length: z.number(),
            })
          )
          .optional(),
        count: z.number().optional(),
      },
    },
    async (input: FindPathsInput): Promise<ToolResponse<FindPathsOutput>> => {
      const { from, to, max_depth = 10 } = input;

      const result = index.findPaths(from, to, max_depth);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const { from: fromId, to: toId, paths } = result.value;

      if (paths.length === 0) {
        return {
          content: [{ type: "text", text: `No paths found from ${from} to ${to} within depth ${max_depth}` }],
          structuredContent: {
            success: true,
            from: fromId,
            to: toId,
            paths: [],
            count: 0,
          },
        };
      }

      // Format output
      const lines: string[] = [
        `# Paths from ${from} to ${to}`,
        "",
        `Found ${paths.length} path(s):`,
        "",
      ];

      for (let i = 0; i < Math.min(paths.length, 20); i++) {
        const path = paths[i];
        lines.push(`## Path ${i + 1} (length: ${path.length})`);
        lines.push("");

        // Format path nodes nicely
        const nodeNames = path.nodes.map((n) => {
          const parts = n.split(":");
          return parts.length > 1 ? parts[1] : n;
        });

        lines.push("```");
        lines.push(nodeNames.join(" → "));
        lines.push("```");
        lines.push("");
      }

      if (paths.length > 20) {
        lines.push(`... and ${paths.length - 20} more paths`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          from: fromId,
          to: toId,
          paths,
          count: paths.length,
        },
      };
    }
  );
}

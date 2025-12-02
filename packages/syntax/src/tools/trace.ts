/**
 * trace - Trace call chains forward or backward from a symbol.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";

interface TraceInput {
  symbol: string;
  direction: "forward" | "backward";
  depth?: number;
}

interface TraceOutput {
  success: boolean;
  error?: string;
  from?: string;
  direction?: "forward" | "backward";
  depth?: number;
  reachable?: Array<{
    name: string;
    namePath: string;
    kind: string;
    file: string;
    line: number;
    depth: number;
  }>;
  count?: number;
}

export function registerTrace(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "trace",
    {
      title: "Trace call graph",
      description: `Trace call chains forward (what does this call?) or backward (who calls this?).

Returns all symbols reachable from the starting symbol within the specified depth.

Use cases:
- Understand impact before refactoring ("who depends on this?")
- Trace data flow through the codebase
- Find all functions that a function transitively calls

Example: trace("handleRequest", "backward", 3) finds all callers up to 3 levels deep.`,
      inputSchema: {
        symbol: z.string().describe("Starting symbol name"),
        direction: z.enum(["forward", "backward"]).describe("Trace direction"),
        depth: z.number().int().min(1).max(10).optional().describe("Maximum depth (default: 5)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        from: z.string().optional(),
        direction: z.enum(["forward", "backward"]).optional(),
        depth: z.number().optional(),
        reachable: z
          .array(
            z.object({
              name: z.string(),
              namePath: z.string(),
              kind: z.string(),
              file: z.string(),
              line: z.number(),
              depth: z.number(),
            })
          )
          .optional(),
        count: z.number().optional(),
      },
    },
    async (input: TraceInput): Promise<ToolResponse<TraceOutput>> => {
      const { symbol, direction, depth = 5 } = input;

      const result = index.trace(symbol, direction, depth);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const { from, reachable } = result.value;
      const directionLabel = direction === "forward" ? "Callees of" : "Callers of";

      if (reachable.length === 0) {
        return {
          content: [{ type: "text", text: `No ${direction === "forward" ? "callees" : "callers"} found for: ${symbol}` }],
          structuredContent: {
            success: true,
            from,
            direction,
            depth,
            reachable: [],
            count: 0,
          },
        };
      }

      // Format output
      const lines: string[] = [
        `# ${directionLabel} ${symbol}`,
        "",
        `Found ${reachable.length} reachable symbol(s) within depth ${depth}:`,
        "",
      ];

      // Group by depth
      const byDepth = new Map<number, typeof reachable>();
      for (const item of reachable) {
        if (!byDepth.has(item.depth)) byDepth.set(item.depth, []);
        byDepth.get(item.depth)!.push(item);
      }

      for (const [d, items] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
        lines.push(`## Depth ${d}`);
        for (const { node } of items) {
          lines.push(`- **${node.namePath}** (${node.kind}) - ${node.file}:${node.line}`);
        }
        lines.push("");
      }

      const structuredReachable = reachable.map(({ node, depth: d }) => ({
        name: node.name,
        namePath: node.namePath,
        kind: node.kind,
        file: node.file,
        line: node.line,
        depth: d,
      }));

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          from,
          direction,
          depth,
          reachable: structuredReachable,
          count: reachable.length,
        },
      };
    }
  );
}

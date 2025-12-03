/**
 * find_dead_code - Find functions/methods not reachable from exports.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";

interface FindDeadCodeInput {
  file_pattern?: string;
}

interface FindDeadCodeOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  totalSymbols?: number;
  entryPoints?: number;
  deadCode?: Array<{
    name: string;
    namePath: string;
    kind: string;
    file: string;
    line: number;
    reason: string;
  }>;
  count?: number;
}

export function registerFindDeadCode(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "find_dead_code",
    {
      title: "Find dead code",
      description: `Find functions/methods that are never called from any exported entry point.

Uses call graph analysis to identify:
- Functions that are never called
- Methods that are never invoked
- Internal helpers that became orphaned after refactoring

The algorithm:
1. Identifies all exported symbols as entry points
2. Traces call chains forward from all entry points
3. Any function NOT reachable from an entry point is dead code

Limitations:
- Doesn't detect unused code paths within functions
- Dynamic calls (computed method names) may not be tracked
- Test files are excluded from analysis`,
      inputSchema: {
        file_pattern: z
          .string()
          .optional()
          .describe("Regex pattern to filter files (e.g., 'src/.*\\.ts')"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        totalSymbols: z.number().optional(),
        entryPoints: z.number().optional(),
        deadCode: z
          .array(
            z.object({
              name: z.string(),
              namePath: z.string(),
              kind: z.string(),
              file: z.string(),
              line: z.number(),
              reason: z.string(),
            })
          )
          .optional(),
        count: z.number().optional(),
      },
    },
    async (input: FindDeadCodeInput): Promise<ToolResponse<FindDeadCodeOutput>> => {
      const { file_pattern } = input;

      const result = index.findDeadCode(file_pattern);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const { totalSymbols, entryPoints, deadCode } = result.value;

      if (deadCode.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No dead code found.\n\nAnalyzed ${totalSymbols} symbols, ${entryPoints} entry points.\nAll functions are reachable from exports.`,
            },
          ],
          structuredContent: {
            success: true,
            totalSymbols,
            entryPoints,
            deadCode: [],
            count: 0,
          },
        };
      }

      // Format output
      const lines: string[] = [
        `# Dead Code Analysis`,
        "",
        `Found ${deadCode.length} potentially dead code item(s)`,
        `Analyzed ${totalSymbols} symbols, ${entryPoints} entry points`,
        "",
      ];

      // Group by file
      const byFile = new Map<string, typeof deadCode>();
      for (const item of deadCode) {
        if (!byFile.has(item.node.file)) byFile.set(item.node.file, []);
        byFile.get(item.node.file)!.push(item);
      }

      for (const [file, items] of byFile) {
        lines.push(`## ${file}`);
        lines.push("");
        for (const { node, reason } of items) {
          lines.push(`- **${node.namePath}** (${node.kind}) - Line ${node.line}`);
          lines.push(`  Reason: ${reason}`);
        }
        lines.push("");
      }

      const structuredDeadCode = deadCode.map(({ node, reason }) => ({
        name: node.name,
        namePath: node.namePath,
        kind: node.kind,
        file: node.file,
        line: node.line,
        reason,
      }));

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          totalSymbols,
          entryPoints,
          deadCode: structuredDeadCode,
          count: deadCode.length,
        },
      };
    }
  );
}

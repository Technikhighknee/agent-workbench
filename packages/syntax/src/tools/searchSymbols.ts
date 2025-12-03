import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { SymbolKind } from "../core/model.js";
import type { IndexedSymbol, ProjectIndex } from "../core/services/ProjectIndex.js";
import { SymbolKindSchema } from "./schemas.js";
import type { ToolResponse } from "./types.js";

interface SearchSymbolsInput {
  pattern: string;
  kinds?: SymbolKind[];
  max_results?: number;
}

interface SearchSymbolsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  symbols?: IndexedSymbol[];
  count?: number;
  truncated?: boolean;
}

export function registerSearchSymbols(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "search_symbols",
    {
      title: "Search symbols",
      description: `Search for symbols by name pattern across all indexed files.

INSTEAD OF: Grep for function names (which finds false positives in strings/comments).

Searches symbol names and name paths using a case-insensitive regex pattern.

Use cases:
- Find all functions matching a pattern (e.g., "handle.*Request")
- Locate a class/interface across the codebase
- Discover symbols before using read_symbol or edit_symbol`,
      inputSchema: {
        pattern: z.string().describe("Regex pattern to match symbol names (case-insensitive)"),
        kinds: z.array(SymbolKindSchema).optional().describe("Filter by symbol kinds"),
        max_results: z.number().optional().describe("Maximum results to return (default: 100)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        symbols: z
          .array(
            z.object({
              name: z.string(),
              namePath: z.string(),
              kind: SymbolKindSchema,
              filePath: z.string(),
              line: z.number(),
              endLine: z.number(),
            })
          )
          .optional(),
        count: z.number().optional(),
        truncated: z.boolean().optional(),
      },
    },
    async (input: SearchSymbolsInput): Promise<ToolResponse<SearchSymbolsOutput>> => {
      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      const maxResults = input.max_results ?? 100;
      const symbols = index.searchSymbols({
        pattern: input.pattern,
        kinds: input.kinds,
        maxResults: maxResults + 1, // Get one extra to detect truncation
      });

      const truncated = symbols.length > maxResults;
      const resultSymbols = truncated ? symbols.slice(0, maxResults) : symbols;

      const formatted = resultSymbols
        .map((s) => `${s.kind} ${s.namePath} (${s.filePath}:${s.line})`)
        .join("\n");

      const summary = truncated
        ? `Found ${resultSymbols.length}+ symbols matching "${input.pattern}" (truncated)`
        : `Found ${resultSymbols.length} symbols matching "${input.pattern}"`;

      return {
        content: [{ type: "text", text: `${summary}\n\n${formatted}` }],
        structuredContent: {
          success: true,
          symbols: resultSymbols,
          count: resultSymbols.length,
          truncated,
        },
      };
    }
  );
}

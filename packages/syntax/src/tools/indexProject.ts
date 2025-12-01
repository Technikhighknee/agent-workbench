import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex, IndexStats } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";

interface IndexProjectInput {
  root_path: string;
}

interface IndexProjectOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  stats?: IndexStats;
}

export function registerIndexProject(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "index_project",
    {
      title: "Index project",
      description: `Index all source files in a project directory for cross-file symbol search.

Scans the directory for supported source files (TypeScript, JavaScript, Python, Go, Rust),
parses them, and builds a searchable symbol index.

Use cases:
- Prepare for cross-file symbol search
- Get project overview (file count, symbol count, languages)
- Enable find_references and rename_symbol operations`,
      inputSchema: {
        root_path: z.string().describe("Project root directory to index"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        stats: z
          .object({
            filesIndexed: z.number(),
            symbolsIndexed: z.number(),
            languages: z.record(z.string(), z.number()),
            lastUpdated: z.string(),
          })
          .optional(),
      },
    },
    async (input: IndexProjectInput): Promise<ToolResponse<IndexProjectOutput>> => {
      const result = await index.index(input.root_path);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const stats = result.value;
      const langSummary = Object.entries(stats.languages)
        .map(([lang, count]) => `${lang}: ${count}`)
        .join(", ");

      const summary = `Indexed ${stats.filesIndexed} files, ${stats.symbolsIndexed} symbols (${langSummary})`;

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { success: true, stats },
      };
    }
  );
}

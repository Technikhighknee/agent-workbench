import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";

interface SearchLogsInput {
  id: string;
  pattern: string;
  case_sensitive?: boolean;
}

interface SearchLogsOutput extends Record<string, unknown> {
  matches: string[];
  count: number;
}

export const registerSearchLogs: ToolRegistrar = (server, service) => {
  server.registerTool(
    "search_logs",
    {
      title: "Search process logs",
      description: `Search for patterns in a process's log output.

Use cases:
- Find error messages: pattern="error"
- Find specific events: pattern="connected"
- Debug issues: pattern="exception|failed"

Returns matching lines from the log output.`,
      inputSchema: {
        id: z.string().describe("Process session ID"),
        pattern: z.string().describe("Search pattern (regex supported)"),
        case_sensitive: z.boolean().optional().describe("Case-sensitive search (default: false)"),
      },
      outputSchema: {
        matches: z.array(z.string()),
        count: z.number(),
      },
    },
    async (input: SearchLogsInput): Promise<ToolResponse<SearchLogsOutput>> => {
      const result = service.searchLogs(input.id, input.pattern, {
        caseSensitive: input.case_sensitive,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { matches: [], count: 0 },
        };
      }

      const matches = result.value;
      const message = matches.length === 0
        ? `No matches for "${input.pattern}"`
        : `Found ${matches.length} match${matches.length === 1 ? "" : "es"}:\n${matches.slice(0, 20).join("\n")}${matches.length > 20 ? `\n... and ${matches.length - 20} more` : ""}`;

      return {
        content: [{ type: "text", text: message }],
        structuredContent: { matches, count: matches.length },
      };
    }
  );
};

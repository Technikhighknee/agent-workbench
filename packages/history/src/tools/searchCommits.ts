/**
 * search_commits tool - Search commits by message.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface SearchCommitsInput {
  query: string;
  limit?: number;
}

export const registerSearchCommits: ToolRegistrar = (server, service) => {
  server.registerTool(
    "search_commits",
    {
      title: "Search commits",
      description:
        "Search commits by message content - find when a feature or fix was added",
      inputSchema: {
        query: z.string().describe("Search term to find in commit messages"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of commits to return"),
      },
    },
    async (input: SearchCommitsInput) => {
      const limit = input.limit ?? 20;
      const result = await service.searchCommits(input.query, limit);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const commits = result.value;

      if (commits.length === 0) {
        return {
          content: [
            { type: "text", text: `No commits found matching "${input.query}".` },
          ],
        };
      }

      const output: string[] = [
        `# Commits matching "${input.query}"`,
        `Found ${commits.length} commit(s)`,
        "",
      ];

      for (const commit of commits) {
        output.push(`## ${commit.shortHash} - ${commit.subject}`);
        output.push(`- **Author:** ${commit.author}`);
        output.push(`- **Date:** ${commit.date}`);
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};

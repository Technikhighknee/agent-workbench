/**
 * file_history tool - Get commits that touched a file.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface FileHistoryInput {
  file_path: string;
  limit?: number;
}

export const registerFileHistory: ToolRegistrar = (server, service) => {
  server.registerTool(
    "file_history",
    {
      title: "File history",
      description: "Get commits that touched a file - understand how code evolved",
      inputSchema: {
        file_path: z.string().describe("Path to the file"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of commits to return"),
      },
    },
    async (input: FileHistoryInput) => {
      const limit = input.limit ?? 20;
      const result = await service.fileHistory(input.file_path, limit);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const commits = result.value;

      if (commits.length === 0) {
        return {
          content: [{ type: "text", text: "No commit history found for this file." }],
        };
      }

      const output: string[] = [
        `# History: ${input.file_path}`,
        `Found ${commits.length} commit(s)`,
        "",
      ];

      for (const commit of commits) {
        output.push(`## ${commit.shortHash} - ${commit.subject}`);
        output.push(`- **Author:** ${commit.author} <${commit.email}>`);
        output.push(`- **Date:** ${commit.date}`);
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};

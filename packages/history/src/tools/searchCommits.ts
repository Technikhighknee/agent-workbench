/**
 * search_commits tool - Search commits by message.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const searchCommitsSchema = z.object({
  query: z.string().describe("Search term to find in commit messages"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of commits to return"),
});

export type SearchCommitsInput = z.infer<typeof searchCommitsSchema>;

export async function searchCommits(
  service: GitService,
  input: SearchCommitsInput
): Promise<string> {
  const result = await service.searchCommits(input.query, input.limit);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const commits = result.value;

  if (commits.length === 0) {
    return `No commits found matching "${input.query}".`;
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

  return output.join("\n");
}

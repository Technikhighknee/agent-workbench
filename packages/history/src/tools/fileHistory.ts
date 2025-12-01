/**
 * file_history tool - Get commits that touched a file.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const fileHistorySchema = z.object({
  file_path: z.string().describe("Path to the file"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of commits to return"),
});

export type FileHistoryInput = z.infer<typeof fileHistorySchema>;

export async function fileHistory(
  service: GitService,
  input: FileHistoryInput
): Promise<string> {
  const result = await service.fileHistory(input.file_path, input.limit);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const commits = result.value;

  if (commits.length === 0) {
    return "No commit history found for this file.";
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

  return output.join("\n");
}

/**
 * commit_info tool - Get details of a commit.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const commitInfoSchema = z.object({
  ref: z
    .string()
    .default("HEAD")
    .describe("Commit reference (hash, branch, tag, HEAD~n, etc.)"),
});

export type CommitInfoInput = z.infer<typeof commitInfoSchema>;

export async function commitInfo(
  service: GitService,
  input: CommitInfoInput
): Promise<string> {
  const result = await service.commitInfo(input.ref);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const commit = result.value;

  const output: string[] = [
    `# Commit ${commit.shortHash}`,
    "",
    `**Hash:** ${commit.hash}`,
    `**Author:** ${commit.author} <${commit.email}>`,
    `**Date:** ${commit.date}`,
    "",
    "## Message",
    "",
    commit.message,
    "",
  ];

  if (commit.files && commit.files.length > 0) {
    output.push("## Files Changed");
    output.push("");
    for (const file of commit.files) {
      const stats = `+${file.additions} -${file.deletions}`;
      output.push(`- ${file.path} (${stats})`);
    }
    output.push("");
  }

  if (commit.parents.length > 0) {
    output.push(`**Parents:** ${commit.parents.join(", ")}`);
  }

  return output.join("\n");
}

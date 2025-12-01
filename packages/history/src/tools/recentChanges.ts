/**
 * recent_changes tool - Get recently changed files.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const recentChangesSchema = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of recent commits to analyze"),
});

export type RecentChangesInput = z.infer<typeof recentChangesSchema>;

export async function recentChanges(
  service: GitService,
  input: RecentChangesInput
): Promise<string> {
  const result = await service.recentChanges(input.count);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const data = result.value;

  if (data.commits.length === 0) {
    return "No recent commits found.";
  }

  const output: string[] = [
    `# Recent Changes (last ${data.commits.length} commits)`,
    "",
    `**Summary:** ${data.filesChanged.length} files changed, +${data.totalAdditions} -${data.totalDeletions}`,
    "",
    "## Commits",
    "",
  ];

  for (const commit of data.commits) {
    const filesStr =
      commit.files && commit.files.length > 0
        ? ` (${commit.files.length} files)`
        : "";
    output.push(
      `- **${commit.shortHash}** ${commit.subject} - *${commit.author}*${filesStr}`
    );
  }

  output.push("");
  output.push("## Files Changed");
  output.push("");

  // Group files by directory for better readability
  const byDir = new Map<string, string[]>();
  for (const file of data.filesChanged) {
    const dir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
    if (!byDir.has(dir)) {
      byDir.set(dir, []);
    }
    byDir.get(dir)!.push(file);
  }

  for (const [dir, files] of Array.from(byDir.entries()).sort()) {
    output.push(`**${dir}/**`);
    for (const file of files.sort()) {
      const basename = file.includes("/") ? file.substring(file.lastIndexOf("/") + 1) : file;
      output.push(`- ${basename}`);
    }
    output.push("");
  }

  return output.join("\n");
}

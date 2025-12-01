/**
 * branch_diff tool - Get summary of changes between branches.
 * Useful for understanding PR scope.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const branchDiffSchema = z.object({
  base: z
    .string()
    .default("main")
    .describe("Base branch to compare against (default: main)"),
  head: z
    .string()
    .default("HEAD")
    .describe("Head ref to compare (default: HEAD/current branch)"),
});

export type BranchDiffInput = z.infer<typeof branchDiffSchema>;

export async function branchDiff(
  service: GitService,
  input: BranchDiffInput
): Promise<string> {
  const result = await service.branchDiff(input.base, input.head);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const diff = result.value;
  const lines: string[] = [];

  lines.push(`# Branch Diff: ${diff.head} vs ${diff.base}`);
  lines.push("");
  lines.push(`**Base:** ${diff.base}`);
  lines.push(`**Head:** ${diff.head}`);
  lines.push(`**Merge base:** ${diff.mergeBase?.slice(0, 7)}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`- **Commits ahead:** ${diff.commitsAhead}`);
  lines.push(`- **Commits behind:** ${diff.commitsBehind}`);
  lines.push(`- **Files changed:** ${diff.files.length}`);
  lines.push(`- **Additions:** +${diff.totalAdditions}`);
  lines.push(`- **Deletions:** -${diff.totalDeletions}`);

  if (diff.files.length > 0) {
    lines.push("");
    lines.push("## Files Changed");
    lines.push("");

    // Group by status
    const added = diff.files.filter((f) => f.status === "A");
    const modified = diff.files.filter((f) => f.status === "M");
    const deleted = diff.files.filter((f) => f.status === "D");
    const other = diff.files.filter((f) => !["A", "M", "D"].includes(f.status));

    if (added.length > 0) {
      lines.push(`### Added (${added.length})`);
      for (const file of added) {
        lines.push(`- \`${file.path}\` (+${file.additions})`);
      }
      lines.push("");
    }

    if (modified.length > 0) {
      lines.push(`### Modified (${modified.length})`);
      for (const file of modified) {
        lines.push(`- \`${file.path}\` (+${file.additions}/-${file.deletions})`);
      }
      lines.push("");
    }

    if (deleted.length > 0) {
      lines.push(`### Deleted (${deleted.length})`);
      for (const file of deleted) {
        lines.push(`- \`${file.path}\` (-${file.deletions})`);
      }
      lines.push("");
    }

    if (other.length > 0) {
      lines.push(`### Other (${other.length})`);
      for (const file of other) {
        lines.push(`- \`${file.path}\` (${file.status})`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

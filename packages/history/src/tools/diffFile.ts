/**
 * diff_file tool - Get diff of a file between commits.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const diffFileSchema = z.object({
  file_path: z.string().describe("Path to the file to diff"),
  from_ref: z
    .string()
    .default("HEAD~1")
    .describe("Starting commit reference (default: HEAD~1)"),
  to_ref: z
    .string()
    .default("HEAD")
    .describe("Ending commit reference (default: HEAD)"),
});

export type DiffFileInput = z.infer<typeof diffFileSchema>;

export async function diffFile(
  service: GitService,
  input: DiffFileInput
): Promise<string> {
  const result = await service.diffFile(
    input.file_path,
    input.from_ref,
    input.to_ref
  );

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const diff = result.value.trim();

  if (!diff) {
    return `No changes to ${input.file_path} between ${input.from_ref} and ${input.to_ref}.`;
  }

  return [
    `# Diff: ${input.file_path}`,
    `**From:** ${input.from_ref}`,
    `**To:** ${input.to_ref}`,
    "",
    "```diff",
    diff,
    "```",
  ].join("\n");
}

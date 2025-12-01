/**
 * blame_file tool - Get git blame for a file.
 */

import { z } from "zod";
import type { GitService } from "../core/GitService.js";

export const blameFileSchema = z.object({
  file_path: z.string().describe("Path to the file to blame"),
});

export type BlameFileInput = z.infer<typeof blameFileSchema>;

export async function blameFile(
  service: GitService,
  input: BlameFileInput
): Promise<string> {
  const result = await service.blame(input.file_path);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const { lines } = result.value;

  if (lines.length === 0) {
    return "No blame information available (file may be untracked or empty).";
  }

  // Group consecutive lines by commit for more compact output
  const groups: {
    commit: string;
    author: string;
    date: string;
    message: string;
    startLine: number;
    endLine: number;
    lines: string[];
  }[] = [];

  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.commit === line.commit) {
      last.endLine = line.line;
      last.lines.push(line.content);
    } else {
      groups.push({
        commit: line.commit,
        author: line.author,
        date: line.date.substring(0, 10), // Just date part
        message: line.message,
        startLine: line.line,
        endLine: line.line,
        lines: [line.content],
      });
    }
  }

  // Format output
  const output: string[] = [`# Blame: ${input.file_path}`, ""];

  for (const group of groups) {
    const lineRange =
      group.startLine === group.endLine
        ? `L${group.startLine}`
        : `L${group.startLine}-${group.endLine}`;

    output.push(
      `## ${lineRange} | ${group.commit} | ${group.author} | ${group.date}`
    );
    output.push(`> ${group.message}`);
    output.push("```");
    output.push(...group.lines);
    output.push("```");
    output.push("");
  }

  return output.join("\n");
}

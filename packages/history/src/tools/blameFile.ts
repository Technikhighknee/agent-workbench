/**
 * blame_file tool - Get git blame for a file.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface BlameFileInput {
  file_path: string;
}

export const registerBlameFile: ToolRegistrar = (server, service) => {
  server.registerTool(
    "blame_file",
    {
      title: "Blame file",
      description: "Get git blame for a file - shows who wrote each line and when. INSTEAD OF: `git blame` in Bash.",
      inputSchema: {
        file_path: z.string().describe("Path to the file to blame"),
      },
    },
    async (input: BlameFileInput) => {
      const result = await service.blame(input.file_path);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const { lines } = result.value;

      if (lines.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No blame information available (file may be untracked or empty).",
            },
          ],
        };
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

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};

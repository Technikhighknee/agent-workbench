/**
 * diff_file tool - Get diff of a file between commits.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface DiffFileInput {
  file_path: string;
  from_ref?: string;
  to_ref?: string;
}

export const registerDiffFile: ToolRegistrar = (server, service) => {
  server.registerTool(
    "diff_file",
    {
      title: "Diff file",
      description: "Get diff of a file between two commits. INSTEAD OF: `git diff` in Bash.",
      inputSchema: {
        file_path: z.string().describe("Path to the file to diff"),
        from_ref: z
          .string()
          .default("HEAD~1")
          .describe("Starting commit reference (default: HEAD~1)"),
        to_ref: z
          .string()
          .default("HEAD")
          .describe("Ending commit reference (default: HEAD)"),
      },
    },
    async (input: DiffFileInput) => {
      const fromRef = input.from_ref ?? "HEAD~1";
      const toRef = input.to_ref ?? "HEAD";
      const result = await service.diffFile(input.file_path, fromRef, toRef);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const diff = result.value.trim();

      if (!diff) {
        return {
          content: [
            {
              type: "text",
              text: `No changes to ${input.file_path} between ${fromRef} and ${toRef}.`,
            },
          ],
        };
      }

      const output = [
        `# Diff: ${input.file_path}`,
        `**From:** ${fromRef}`,
        `**To:** ${toRef}`,
        "",
        "```diff",
        diff,
        "```",
      ].join("\n");

      return { content: [{ type: "text", text: output }] };
    }
  );
};

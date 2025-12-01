/**
 * git_add tool - Stage files for commit.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface GitAddInput {
  paths: string[];
}

export const registerGitAdd: ToolRegistrar = (server, service) => {
  server.registerTool(
    "git_add",
    {
      title: "Git add",
      description:
        "Stage files for commit. INSTEAD OF: `git add` in Bash. Accepts file paths or patterns.",
      inputSchema: {
        paths: z
          .array(z.string())
          .describe("File paths to stage (can include . for all files)"),
      },
    },
    async (input: GitAddInput) => {
      const result = await service.add(input.paths);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const { added, count } = result.value;

      if (count === 0) {
        return {
          content: [{ type: "text", text: "No files were staged (already staged or no changes)." }],
          structuredContent: { success: true, count: 0, files: [] },
        };
      }

      const output = [
        `Staged ${count} file(s):`,
        ...added.map((f) => `  ${f}`),
        "",
        "---",
        "**Ready to commit.** Use `git_commit` to create a commit.",
      ];

      return {
        content: [{ type: "text", text: output.join("\n") }],
        structuredContent: {
          success: true,
          count,
          files: added,
        },
      };
    }
  );
};

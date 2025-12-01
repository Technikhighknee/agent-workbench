/**
 * git_commit tool - Create a commit with staged changes.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface GitCommitInput {
  message: string;
}

export const registerGitCommit: ToolRegistrar = (server, service) => {
  server.registerTool(
    "git_commit",
    {
      title: "Git commit",
      description:
        "Create a commit with staged changes. INSTEAD OF: `git commit` in Bash. Requires staged files.",
      inputSchema: {
        message: z.string().describe("Commit message"),
      },
    },
    async (input: GitCommitInput) => {
      const result = await service.commit(input.message);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const commit = result.value;

      const output = [
        `✓ Commit created: ${commit.shortHash}`,
        "",
        `  ${commit.subject}`,
        "",
        `  ${commit.filesChanged} file(s) changed`,
      ];

      if (commit.insertions > 0 || commit.deletions > 0) {
        const stats: string[] = [];
        if (commit.insertions > 0) stats.push(`+${commit.insertions}`);
        if (commit.deletions > 0) stats.push(`-${commit.deletions}`);
        output.push(`  ${stats.join(", ")}`);
      }

      return {
        content: [{ type: "text", text: output.join("\n") }],
        structuredContent: {
          success: true,
          hash: commit.hash,
          shortHash: commit.shortHash,
          subject: commit.subject,
          filesChanged: commit.filesChanged,
          insertions: commit.insertions,
          deletions: commit.deletions,
        },
      };
    }
  );
};

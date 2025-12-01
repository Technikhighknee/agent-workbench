/**
 * commit_info tool - Get details of a commit.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface CommitInfoInput {
  ref?: string;
}

export const registerCommitInfo: ToolRegistrar = (server, service) => {
  server.registerTool(
    "commit_info",
    {
      title: "Commit info",
      description: "Get details of a specific commit - message, author, files changed. INSTEAD OF: `git show` in Bash.",
      inputSchema: {
        ref: z
          .string()
          .default("HEAD")
          .describe("Commit reference (hash, branch, tag, HEAD~n, etc.)"),
      },
    },
    async (input: CommitInfoInput) => {
      const ref = input.ref ?? "HEAD";
      const result = await service.commitInfo(ref);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
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

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};

/**
 * recent_changes tool - Get recently changed files.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface RecentChangesInput {
  count?: number;
}

export const registerRecentChanges: ToolRegistrar = (server, service) => {
  server.registerTool(
    "recent_changes",
    {
      title: "Recent changes",
      description: "Get recently changed files across the repository",
      inputSchema: {
        count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Number of recent commits to analyze"),
      },
    },
    async (input: RecentChangesInput) => {
      const count = input.count ?? 10;
      const result = await service.recentChanges(count);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const data = result.value;

      if (data.commits.length === 0) {
        return { content: [{ type: "text", text: "No recent commits found." }] };
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
        const dir = file.includes("/")
          ? file.substring(0, file.lastIndexOf("/"))
          : ".";
        if (!byDir.has(dir)) {
          byDir.set(dir, []);
        }
        byDir.get(dir)!.push(file);
      }

      for (const [dir, files] of Array.from(byDir.entries()).sort()) {
        output.push(`**${dir}/**`);
        for (const file of files.sort()) {
          const basename = file.includes("/")
            ? file.substring(file.lastIndexOf("/") + 1)
            : file;
          output.push(`- ${basename}`);
        }
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};

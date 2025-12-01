/**
 * git_status tool - Get current repository status.
 */

import type { ToolRegistrar } from "./types.js";

export const registerGitStatus: ToolRegistrar = (server, service) => {
  server.registerTool(
    "git_status",
    {
      title: "Git status",
      description:
        "Get current git status - branch, staged/unstaged changes, untracked files. INSTEAD OF: `git status` in Bash.",
      inputSchema: {},
    },
    async () => {
      const result = await service.status();

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const status = result.value;
      const output: string[] = [];

      // Branch info
      output.push(`# Branch: ${status.branch}`);
      if (status.upstream) {
        output.push(`Tracking: ${status.upstream}`);
        if (status.ahead > 0 || status.behind > 0) {
          const parts: string[] = [];
          if (status.ahead > 0) parts.push(`${status.ahead} ahead`);
          if (status.behind > 0) parts.push(`${status.behind} behind`);
          output.push(`Status: ${parts.join(", ")}`);
        }
      }
      output.push("");

      // Staged changes
      if (status.staged.length > 0) {
        output.push("## Staged for commit:");
        for (const file of status.staged) {
          const statusChar =
            file.status === "A"
              ? "new file"
              : file.status === "M"
              ? "modified"
              : file.status === "D"
              ? "deleted"
              : file.status === "R"
              ? `renamed from ${file.oldPath}`
              : file.status;
          output.push(`  ${statusChar}: ${file.path}`);
        }
        output.push("");
      }

      // Unstaged changes
      if (status.unstaged.length > 0) {
        output.push("## Not staged:");
        for (const file of status.unstaged) {
          const statusChar =
            file.status === "M"
              ? "modified"
              : file.status === "D"
              ? "deleted"
              : file.status;
          output.push(`  ${statusChar}: ${file.path}`);
        }
        output.push("");
      }

      // Untracked files
      if (status.untracked.length > 0) {
        output.push("## Untracked files:");
        for (const file of status.untracked) {
          output.push(`  ${file}`);
        }
        output.push("");
      }

      // Conflicts
      if (status.conflicted.length > 0) {
        output.push("## ⚠️ Unmerged paths (conflicts):");
        for (const file of status.conflicted) {
          output.push(`  ${file}`);
        }
        output.push("");
      }

      // Clean state
      if (
        status.staged.length === 0 &&
        status.unstaged.length === 0 &&
        status.untracked.length === 0 &&
        status.conflicted.length === 0
      ) {
        output.push("Working tree clean");
      }

      return {
        content: [{ type: "text", text: output.join("\n") }],
        structuredContent: {
          success: true,
          branch: status.branch,
          upstream: status.upstream,
          ahead: status.ahead,
          behind: status.behind,
          stagedCount: status.staged.length,
          unstagedCount: status.unstaged.length,
          untrackedCount: status.untracked.length,
          hasConflicts: status.conflicted.length > 0,
        },
      };
    }
  );
};

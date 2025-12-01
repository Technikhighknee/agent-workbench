/**
 * MCP tool registration for history package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitService } from "../core/GitService.js";

import { blameFile, blameFileSchema } from "./blameFile.js";
import { fileHistory, fileHistorySchema } from "./fileHistory.js";
import { recentChanges, recentChangesSchema } from "./recentChanges.js";
import { commitInfo, commitInfoSchema } from "./commitInfo.js";
import { searchCommits, searchCommitsSchema } from "./searchCommits.js";
import { diffFile, diffFileSchema } from "./diffFile.js";
import { branchDiff, branchDiffSchema } from "./branchDiff.js";

/**
 * Register all history tools with an MCP server.
 */
export function registerTools(server: McpServer, projectRoot: string): void {
  const service = new GitService(projectRoot);

  server.tool(
    "blame_file",
    "Get git blame for a file - shows who wrote each line and when",
    blameFileSchema.shape,
    async (input) => {
      const result = await blameFile(service, blameFileSchema.parse(input));
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "file_history",
    "Get commits that touched a file - understand how code evolved",
    fileHistorySchema.shape,
    async (input) => {
      const result = await fileHistory(service, fileHistorySchema.parse(input));
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "recent_changes",
    "Get recently changed files across the repository",
    recentChangesSchema.shape,
    async (input) => {
      const result = await recentChanges(
        service,
        recentChangesSchema.parse(input)
      );
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "commit_info",
    "Get details of a specific commit - message, author, files changed",
    commitInfoSchema.shape,
    async (input) => {
      const result = await commitInfo(service, commitInfoSchema.parse(input));
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "search_commits",
    "Search commits by message content - find when a feature or fix was added",
    searchCommitsSchema.shape,
    async (input) => {
      const result = await searchCommits(
        service,
        searchCommitsSchema.parse(input)
      );
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "diff_file",
    "Get diff of a file between two commits",
    diffFileSchema.shape,
    async (input) => {
      const result = await diffFile(service, diffFileSchema.parse(input));
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "branch_diff",
    "Get summary of changes between branches - files changed, additions/deletions, commits ahead/behind",
    branchDiffSchema.shape,
    async (input) => {
      const result = await branchDiff(service, branchDiffSchema.parse(input));
      return { content: [{ type: "text", text: result }] };
    }
  );
}

/**
 * MCP tool registration for history package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitService } from "../core/GitService.js";

import { registerBlameFile } from "./blameFile.js";
import { registerFileHistory } from "./fileHistory.js";
import { registerRecentChanges } from "./recentChanges.js";
import { registerCommitInfo } from "./commitInfo.js";
import { registerSearchCommits } from "./searchCommits.js";
import { registerDiffFile } from "./diffFile.js";
import { registerBranchDiff } from "./branchDiff.js";

/**
 * Register all history tools with an MCP server.
 */
export function registerTools(server: McpServer, projectRoot: string): void {
  const service = new GitService(projectRoot);

  registerBlameFile(server, service);
  registerFileHistory(server, service);
  registerRecentChanges(server, service);
  registerCommitInfo(server, service);
  registerSearchCommits(server, service);
  registerDiffFile(server, service);
  registerBranchDiff(server, service);
}

export * from "./types.js";

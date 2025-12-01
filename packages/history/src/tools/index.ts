/**
 * MCP tool registration for history package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitService } from "../core/GitService.js";

// Read operations
import { registerBlameFile } from "./blameFile.js";
import { registerFileHistory } from "./fileHistory.js";
import { registerRecentChanges } from "./recentChanges.js";
import { registerCommitInfo } from "./commitInfo.js";
import { registerSearchCommits } from "./searchCommits.js";
import { registerDiffFile } from "./diffFile.js";
import { registerBranchDiff } from "./branchDiff.js";

// Write operations
import { registerGitStatus } from "./gitStatus.js";
import { registerGitAdd } from "./gitAdd.js";
import { registerGitCommit } from "./gitCommit.js";

/**
 * Register all history tools with an MCP server.
 */
export function registerTools(server: McpServer, projectRoot: string): void {
  const service = new GitService(projectRoot);

  // Read operations
  registerBlameFile(server, service);
  registerFileHistory(server, service);
  registerRecentChanges(server, service);
  registerCommitInfo(server, service);
  registerSearchCommits(server, service);
  registerDiffFile(server, service);
  registerBranchDiff(server, service);

  // Write operations
  registerGitStatus(server, service);
  registerGitAdd(server, service);
  registerGitCommit(server, service);
}

export * from "./types.js";

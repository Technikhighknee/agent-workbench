/**
 * MCP tool registration for history package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitService } from "../core/GitService.js";

// Read operations
import { registerBlameFile } from "./blameFile.js";
import { registerFileHistory } from "./fileHistory.js";
import { registerRecentChanges } from "./recentChanges.js";
import { registerCommitInfo } from "./commitInfo.js";
import { registerSearchCommits } from "./searchCommits.js";
import { registerDiffFile } from "./diffFile.js";
import { registerBranchDiff } from "./branchDiff.js";
import { registerChangedSymbols } from "./changedSymbols.js";

// Write operations
import { registerGitStatus } from "./gitStatus.js";
import { registerGitAdd } from "./gitAdd.js";
import { registerGitCommit } from "./gitCommit.js";

export interface Services {
  git: GitService;
}

/**
 * Register all history tools with an MCP server.
 */
export function registerAllTools(server: McpServer, services: Services): void {
  const { git } = services;

  // Read operations
  registerBlameFile(server, git);
  registerFileHistory(server, git);
  registerRecentChanges(server, git);
  registerCommitInfo(server, git);
  registerSearchCommits(server, git);
  registerDiffFile(server, git);
  registerBranchDiff(server, git);
  registerChangedSymbols(server, git);

  // Write operations
  registerGitStatus(server, git);
  registerGitAdd(server, git);
  registerGitCommit(server, git);
}

export * from "./types.js";

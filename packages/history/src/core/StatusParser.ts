/**
 * Git status output parser.
 * Parses git status porcelain v2 format.
 */

import type { GitStatus, StatusFile } from "./model.js";

/**
 * Parse git status --porcelain=v2 output.
 */
export function parseStatusOutput(output: string): GitStatus {
  const status: GitStatus = {
    branch: "",
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };

  const lines = output.split("\n");
  for (const line of lines) {
    if (!line) continue;

    // Branch header: # branch.head <name>
    if (line.startsWith("# branch.head ")) {
      status.branch = line.slice(14);
    }
    // Upstream: # branch.upstream <name>
    else if (line.startsWith("# branch.upstream ")) {
      status.upstream = line.slice(18);
    }
    // Ahead/behind: # branch.ab +<ahead> -<behind>
    else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        status.ahead = parseInt(match[1], 10);
        status.behind = parseInt(match[2], 10);
      }
    }
    // Changed entry: 1 <XY> ... <path>
    else if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      const xy = parts[1]; // XY status
      const filePath = parts.slice(8).join(" ");

      const stagedStatus = xy[0];
      const unstagedStatus = xy[1];

      if (stagedStatus !== ".") {
        status.staged.push({
          path: filePath,
          status: stagedStatus as StatusFile["status"],
        });
      }
      if (unstagedStatus !== ".") {
        status.unstaged.push({
          path: filePath,
          status: unstagedStatus as StatusFile["status"],
        });
      }
    }
    // Renamed: 2 <XY> ... <path><tab><origPath>
    else if (line.startsWith("2 ")) {
      const parts = line.split("\t");
      const mainPart = parts[0].split(" ");
      const xy = mainPart[1];
      const filePath = mainPart.slice(9).join(" ");
      const oldPath = parts[1];

      if (xy[0] !== ".") {
        status.staged.push({
          path: filePath,
          status: "R",
          oldPath,
        });
      }
    }
    // Unmerged: u <XY> ... <path>
    else if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const filePath = parts.slice(10).join(" ");
      status.conflicted.push(filePath);
    }
    // Untracked: ? <path>
    else if (line.startsWith("? ")) {
      status.untracked.push(line.slice(2));
    }
  }

  return status;
}

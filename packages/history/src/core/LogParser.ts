/**
 * Git log output parser.
 * Parses various git log formats.
 */

import type { Commit, RecentChanges } from "./model.js";

/**
 * Parse standard log format output with configurable delimiter.
 */
export function parseLogOutput(output: string, delimiter: string = "|"): Commit[] {
  const commits: Commit[] = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const parts = line.split(delimiter);
    if (parts.length < 6) continue;

    commits.push({
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      subject: parts[5],
      message: parts[5],
      parents: parts[6] ? parts[6].split(" ").filter(Boolean) : [],
    });
  }

  return commits;
}

/**
 * Parse log output with stats for recent changes.
 */
export function parseLogWithStats(output: string): RecentChanges {
  const commits: Commit[] = [];
  const filesChanged = new Set<string>();
  let totalAdditions = 0;
  let totalDeletions = 0;

  // Parse log with stats - commits start with a 40-char hash followed by null byte
  const sections = output.split(/\n(?=[a-f0-9]{40}\x00)/);
  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split("\n");
    const firstLine = lines[0];
    const parts = firstLine.split("\x00");
    if (parts.length < 6) continue;

    const commit: Commit = {
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      subject: parts[5],
      message: parts[5],
      parents: parts[6] ? parts[6].split(" ").filter(Boolean) : [],
      files: [],
    };

    // Parse stat lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Match file stat lines: " file.ts | 10 ++++----"
      const statMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s*([+-]*)/);
      if (statMatch) {
        const filePath = statMatch[1].trim();
        filesChanged.add(filePath);

        const changes = statMatch[3] || "";
        const adds = (changes.match(/\+/g) || []).length;
        const dels = (changes.match(/-/g) || []).length;
        totalAdditions += adds;
        totalDeletions += dels;

        commit.files!.push({
          path: filePath,
          status: "M",
          additions: adds,
          deletions: dels,
        });
      }
    }

    commits.push(commit);
  }

  return {
    commits,
    filesChanged: Array.from(filesChanged).sort(),
    totalAdditions,
    totalDeletions,
  };
}

/**
 * Parse file stat lines from git show output.
 */
export function parseStatLines(output: string): Array<{
  path: string;
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";
  additions: number;
  deletions: number;
}> {
  const files: Array<{
    path: string;
    status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";
    additions: number;
    deletions: number;
  }> = [];

  const lines = output.split("\n");
  for (const line of lines) {
    const statMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s*([+-]*)/);
    if (statMatch) {
      const changes = statMatch[3] || "";
      files.push({
        path: statMatch[1].trim(),
        status: "M",
        additions: (changes.match(/\+/g) || []).length,
        deletions: (changes.match(/-/g) || []).length,
      });
    }
  }

  return files;
}

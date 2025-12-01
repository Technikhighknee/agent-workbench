/**
 * Core domain types for the history package.
 */

/**
 * A single line of blame output.
 */
export interface BlameLine {
  /** Line number (1-indexed) */
  line: number;
  /** Commit hash (short) */
  commit: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Commit timestamp (ISO 8601) */
  date: string;
  /** Commit message (first line) */
  message: string;
  /** The actual line content */
  content: string;
}

/**
 * Result of blaming a file.
 */
export interface BlameResult {
  filePath: string;
  lines: BlameLine[];
}

/**
 * A file changed in a commit.
 */
export interface ChangedFile {
  /** File path */
  path: string;
  /** Change type: A=added, M=modified, D=deleted, R=renamed */
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Old path (for renames) */
  oldPath?: string;
}

/**
 * A git commit.
 */
export interface Commit {
  /** Full commit hash */
  hash: string;
  /** Short hash (7 chars) */
  shortHash: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Commit timestamp (ISO 8601) */
  date: string;
  /** Full commit message */
  message: string;
  /** First line of message */
  subject: string;
  /** Parent commit hashes */
  parents: string[];
  /** Files changed (if requested) */
  files?: ChangedFile[];
}

/**
 * Summary of recent changes.
 */
export interface RecentChanges {
  /** Commits in range */
  commits: Commit[];
  /** All files touched */
  filesChanged: string[];
  /** Total additions */
  totalAdditions: number;
  /** Total deletions */
  totalDeletions: number;
}

/**
 * Summary of changes between two branches or refs.
 */
export interface BranchDiff {
  /** Base ref (e.g., "main") */
  base: string;
  /** Head ref (e.g., "feature-branch" or "HEAD") */
  head: string;
  /** Number of commits ahead of base */
  commitsAhead: number;
  /** Number of commits behind base */
  commitsBehind: number;
  /** Files changed */
  files: ChangedFile[];
  /** Total additions */
  totalAdditions: number;
  /** Total deletions */
  totalDeletions: number;
  /** Merge base commit */
  mergeBase?: string;
}

// Re-export Result utilities from core
export { Result, ok, err } from "@agent-workbench/core";

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
 * Result type for operations that can fail.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a success result.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create an error result.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

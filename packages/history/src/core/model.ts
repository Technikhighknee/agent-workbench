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

/**
 * Git status result.
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Tracking branch (e.g., "origin/main") */
  upstream?: string;
  /** Commits ahead of upstream */
  ahead: number;
  /** Commits behind upstream */
  behind: number;
  /** Staged files */
  staged: StatusFile[];
  /** Unstaged modified files */
  unstaged: StatusFile[];
  /** Untracked files */
  untracked: string[];
  /** Files with merge conflicts */
  conflicted: string[];
}

/**
 * A file in git status output.
 */
export interface StatusFile {
  /** File path */
  path: string;
  /** Status: A=added, M=modified, D=deleted, R=renamed */
  status: "A" | "M" | "D" | "R" | "C" | "?" | "!" | "U";
  /** Old path (for renames) */
  oldPath?: string;
}

/**
 * Result of a git add operation.
 */
export interface AddResult {
  /** Files that were added/staged */
  added: string[];
  /** Number of files staged */
  count: number;
}

/**
 * Result of a git commit operation.
 */
export interface CommitResult {
  /** Commit hash */
  hash: string;
  /** Short hash */
  shortHash: string;
  /** Commit message subject */
  subject: string;
  /** Number of files changed */
  filesChanged: number;
  /** Lines added */
  insertions: number;
  /** Lines deleted */
  deletions: number;
}

/**
 * Result of a git push operation.
 */
export interface PushResult {
  /** Whether push succeeded */
  success: boolean;
  /** Remote name */
  remote: string;
  /** Branch pushed */
  branch: string;
  /** New commits pushed */
  commitsPushed: number;
  /** Any warnings or messages */
  message?: string;
}

/**
 * A symbol that changed between two git refs.
 */
export interface ChangedSymbol {
  /** Symbol name */
  name: string;
  /** Full qualified name (e.g., "MyClass.myMethod") */
  qualifiedName: string;
  /** Symbol kind: function, class, method, etc. */
  kind: string;
  /** File where the symbol is located */
  file: string;
  /** Line number (in the newer version, or last known for deleted) */
  line: number;
  /** Change type: added, modified, or deleted */
  changeType: "added" | "modified" | "deleted";
}

/**
 * Result of comparing symbols between two git refs.
 */
export interface ChangedSymbolsResult {
  /** Base ref (older) */
  fromRef: string;
  /** Head ref (newer) */
  toRef: string;
  /** Symbols that were added */
  added: ChangedSymbol[];
  /** Symbols that were modified */
  modified: ChangedSymbol[];
  /** Symbols that were deleted */
  deleted: ChangedSymbol[];
  /** Files that were analyzed */
  filesAnalyzed: number;
  /** Files that couldn't be parsed */
  parseErrors: string[];
}

// Re-export Result utilities from core
export type { Result } from "@agent-workbench/core";
export { ok, err } from "@agent-workbench/core";

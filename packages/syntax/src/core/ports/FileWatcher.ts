import { Result } from "@agent-workbench/core";

/**
 * Event types for file watching.
 */
export type FileWatchEvent = "add" | "change" | "unlink";

/**
 * Callback for file change events.
 */
export type FileWatchCallback = (event: FileWatchEvent, relativePath: string) => void;

/**
 * Port for file system watching.
 */
export interface FileWatcher {
  /**
   * Start watching a directory for changes.
   *
   * @param rootPath - Directory to watch
   * @param extensions - File extensions to watch (e.g., [".ts", ".js"])
   * @param callback - Function called on each file change
   */
  watch(
    rootPath: string,
    extensions: string[],
    callback: FileWatchCallback
  ): Result<void, Error>;

  /**
   * Stop watching.
   */
  stop(): void;

  /**
   * Check if currently watching.
   */
  isWatching(): boolean;
}

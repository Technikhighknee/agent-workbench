import type { Result } from "@agent-workbench/core";

export interface FileStats {
  mtime: number;
  size: number;
}

/**
 * Port for file system operations.
 */
export interface FileSystem {
  /**
   * Read file contents as string.
   */
  read(filePath: string): Result<string, Error>;

  /**
   * Write content to file.
   */
  write(filePath: string, content: string): Result<void, Error>;

  /**
   * Check if file exists.
   */
  exists(filePath: string): boolean;

  /**
   * Get file stats (for cache invalidation).
   */
  stats(filePath: string): Result<FileStats, Error>;
}

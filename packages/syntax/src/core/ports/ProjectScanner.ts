import { Result } from "@agent-workbench/core";

/**
 * Port for discovering files in a project.
 */
export interface ProjectScanner {
  /**
   * Scan a directory for source files.
   * Should respect .gitignore and common ignore patterns.
   *
   * @param rootPath - Project root directory
   * @param extensions - File extensions to include (e.g., [".ts", ".js"])
   * @returns List of file paths relative to rootPath
   */
  scan(rootPath: string, extensions: string[]): Promise<Result<string[], Error>>;

  /**
   * Check if a path should be ignored.
   */
  shouldIgnore(filePath: string): boolean;
}

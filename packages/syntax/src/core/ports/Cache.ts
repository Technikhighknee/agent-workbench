import { SymbolTree } from "../symbolTree.js";

/**
 * Port for caching parsed symbol trees.
 */
export interface SymbolCache {
  /**
   * Get cached symbol tree if still valid.
   *
   * @param filePath - Path to the file
   * @param mtime - Current modification time (for validation)
   * @returns Cached tree if valid, undefined otherwise
   */
  get(filePath: string, mtime: number): SymbolTree | undefined;

  /**
   * Store symbol tree in cache.
   *
   * @param filePath - Path to the file
   * @param mtime - Modification time when parsed
   * @param tree - The parsed symbol tree
   */
  set(filePath: string, mtime: number, tree: SymbolTree): void;

  /**
   * Invalidate cache entry for a file.
   */
  invalidate(filePath: string): void;

  /**
   * Clear all cached entries.
   */
  clear(): void;
}

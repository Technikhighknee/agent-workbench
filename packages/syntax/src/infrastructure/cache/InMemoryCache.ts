import { SymbolCache } from "../../core/ports/Cache.js";
import { SymbolTree } from "../../core/symbolTree.js";

interface CacheEntry {
  tree: SymbolTree;
  mtime: number;
}

/**
 * In-memory implementation of SymbolCache.
 * Validates entries by file modification time.
 */
export class InMemoryCache implements SymbolCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(filePath: string, mtime: number): SymbolTree | undefined {
    const entry = this.cache.get(filePath);
    if (!entry) return undefined;

    // Validate by modification time
    if (entry.mtime !== mtime) {
      this.cache.delete(filePath);
      return undefined;
    }

    return entry.tree;
  }

  set(filePath: string, mtime: number, tree: SymbolTree): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(filePath)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(filePath, { tree, mtime });
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }
}

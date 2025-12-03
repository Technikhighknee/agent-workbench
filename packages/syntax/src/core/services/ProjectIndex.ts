/**
 * Project Index - Manages a cross-file symbol index for a project.
 */

import { Err, Ok, Result } from "@agent-workbench/core";

import {
  CallSite,
  DeadCodeResult,
  DependencyAnalysis,
  FindPathsResult,
  IndexedSymbol,
  LANGUAGES,
  SymbolKind,
  SymbolReference,
  TraceResult,
} from "../model.js";
import type { SymbolCache } from "../ports/Cache.js";
import type { FileSystem } from "../ports/FileSystem.js";
import type { FileWatcher } from "../ports/FileWatcher.js";
import type { ParseResult, Parser } from "../ports/Parser.js";
import type { ProjectScanner } from "../ports/ProjectScanner.js";
import { flattenSymbols, SymbolTree } from "../symbolTree.js";
import { CallGraphService } from "./CallGraphService.js";
import { getCallers, getCallees } from "./CallerCalleeSearch.js";
import { analyzeDependencies } from "./DependencyAnalyzer.js";
import { findReferences } from "./ReferenceSearch.js";

// Re-export for backwards compatibility
export type { IndexedSymbol } from "../model.js";

export interface SearchSymbolsParams {
  pattern: string;
  kinds?: SymbolKind[];
  maxResults?: number;
}

export interface IndexStats {
  filesIndexed: number;
  symbolsIndexed: number;
  languages: Record<string, number>;
  lastUpdated: string;
  watching: boolean;
}

/**
 * Manages a cross-file symbol index for a project.
 */
export class ProjectIndex {
  private readonly indexedFiles = new Map<string, SymbolTree>();
  private readonly allSymbols: IndexedSymbol[] = [];
  private rootPath: string = "";
  private lastIndexTime: Date | null = null;
  private watcher: FileWatcher | null = null;
  private watchCallback: ((event: string, file: string) => void) | null = null;
  private readonly callGraphService: CallGraphService;

  constructor(
    private readonly parser: Parser,
    private readonly fs: FileSystem,
    private readonly cache: SymbolCache,
    private readonly scanner: ProjectScanner
  ) {
    this.callGraphService = new CallGraphService(fs);
  }

  /**
   * Index all source files in a project directory.
   */
  async index(rootPath: string): Promise<Result<IndexStats, string>> {
    this.rootPath = rootPath;
    this.indexedFiles.clear();
    this.allSymbols.length = 0;

    const extensions = Object.values(LANGUAGES).flatMap((l) => l.extensions);
    const scanResult = await this.scanner.scan(rootPath, extensions);
    if (!scanResult.ok) {
      return Err(scanResult.error.message);
    }

    const files = scanResult.value;
    const languages: Record<string, number> = {};

    for (const relativePath of files) {
      const fullPath = this.resolvePath(relativePath);
      const parseResult = await this.parseAndCache(fullPath);

      if (parseResult.ok) {
        const tree = parseResult.value.tree;
        this.indexedFiles.set(relativePath, tree);
        languages[tree.language] = (languages[tree.language] ?? 0) + 1;

        const flattened = flattenSymbols(tree);
        for (const { symbol, namePath } of flattened) {
          this.allSymbols.push({
            name: symbol.name,
            namePath,
            kind: symbol.kind,
            filePath: relativePath,
            line: symbol.span.start.line,
            endLine: symbol.span.end.line,
          });
        }
      }
    }

    this.lastIndexTime = new Date();

    return Ok({
      filesIndexed: this.indexedFiles.size,
      symbolsIndexed: this.allSymbols.length,
      languages,
      lastUpdated: this.lastIndexTime.toISOString(),
      watching: this.isWatching(),
    });
  }

  /**
   * Search for symbols by name pattern.
   */
  searchSymbols(params: SearchSymbolsParams): IndexedSymbol[] {
    const { pattern, kinds, maxResults = 100 } = params;
    const regex = new RegExp(pattern, "i");
    const results: IndexedSymbol[] = [];

    for (const symbol of this.allSymbols) {
      if (results.length >= maxResults) break;
      if (!regex.test(symbol.name) && !regex.test(symbol.namePath)) continue;
      if (kinds && kinds.length > 0 && !kinds.includes(symbol.kind)) continue;
      results.push(symbol);
    }

    return results;
  }

  getFileSymbols(relativePath: string): IndexedSymbol[] {
    return this.allSymbols.filter((s) => s.filePath === relativePath);
  }

  getTree(relativePath: string): SymbolTree | undefined {
    return this.indexedFiles.get(relativePath);
  }

  getIndexedFiles(): string[] {
    return Array.from(this.indexedFiles.keys());
  }

  async reindexFile(relativePath: string): Promise<Result<void, string>> {
    this.callGraphService.invalidate();

    const fullPath = this.resolvePath(relativePath);
    const filtered = this.allSymbols.filter((s) => s.filePath !== relativePath);
    this.allSymbols.length = 0;
    this.allSymbols.push(...filtered);

    const parseResult = await this.parseAndCache(fullPath);
    if (!parseResult.ok) {
      this.indexedFiles.delete(relativePath);
      return Err(parseResult.error.message);
    }

    const tree = parseResult.value.tree;
    this.indexedFiles.set(relativePath, tree);

    const flattened = flattenSymbols(tree);
    for (const { symbol, namePath } of flattened) {
      this.allSymbols.push({
        name: symbol.name,
        namePath,
        kind: symbol.kind,
        filePath: relativePath,
        line: symbol.span.start.line,
        endLine: symbol.span.end.line,
      });
    }

    return Ok(undefined);
  }

  getStats(): IndexStats {
    const languages: Record<string, number> = {};
    for (const tree of this.indexedFiles.values()) {
      languages[tree.language] = (languages[tree.language] ?? 0) + 1;
    }

    return {
      filesIndexed: this.indexedFiles.size,
      symbolsIndexed: this.allSymbols.length,
      languages,
      lastUpdated: this.lastIndexTime?.toISOString() ?? "never",
      watching: this.isWatching(),
    };
  }

  isEmpty(): boolean {
    return this.indexedFiles.size === 0;
  }

  // File watching

  startWatching(
    watcher: FileWatcher,
    callback?: (event: string, file: string) => void
  ): Result<void, string> {
    if (!this.rootPath) {
      return Err("No project indexed. Call index first.");
    }

    this.stopWatching();
    this.watcher = watcher;
    this.watchCallback = callback ?? null;

    const extensions = Object.values(LANGUAGES).flatMap((l) => l.extensions);

    const result = watcher.watch(this.rootPath, extensions, async (event, relativePath) => {
      if (event === "unlink") {
        this.removeFile(relativePath);
      } else {
        await this.reindexFile(relativePath);
      }
      if (this.watchCallback) {
        this.watchCallback(event, relativePath);
      }
    });

    if (!result.ok) {
      return Err(result.error.message);
    }
    return Ok(undefined);
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
      this.watchCallback = null;
    }
  }

  isWatching(): boolean {
    return this.watcher !== null && this.watcher.isWatching();
  }

  // Reference and call analysis (delegated)

  async findReferences(
    symbolName: string,
    definitionFile?: string
  ): Promise<Result<SymbolReference[], string>> {
    return findReferences(
      {
        indexedFiles: this.indexedFiles,
        allSymbols: this.allSymbols,
        fs: this.fs,
        resolvePath: (p) => this.resolvePath(p),
      },
      symbolName,
      definitionFile
    );
  }

  async getCallers(symbolName: string): Promise<Result<CallSite[], string>> {
    return getCallers(
      {
        indexedFiles: this.indexedFiles,
        fs: this.fs,
        resolvePath: (p) => this.resolvePath(p),
        rootPath: this.rootPath,
      },
      symbolName
    );
  }

  async getCallees(
    filePath: string,
    symbolNamePath: string
  ): Promise<Result<CallSite[], string>> {
    return getCallees(
      {
        indexedFiles: this.indexedFiles,
        fs: this.fs,
        resolvePath: (p) => this.resolvePath(p),
        rootPath: this.rootPath,
      },
      filePath,
      symbolNamePath
    );
  }

  async analyzeDependencies(): Promise<Result<DependencyAnalysis, string>> {
    return analyzeDependencies({
      indexedFiles: this.indexedFiles,
      fs: this.fs,
      parser: this.parser,
      resolvePath: (p) => this.resolvePath(p),
    });
  }

  // Call graph methods (delegated to CallGraphService)

  trace(
    symbolName: string,
    direction: "forward" | "backward",
    maxDepth: number = 5
  ): Result<TraceResult, string> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }
    this.ensureCallGraph();
    return this.callGraphService.trace(symbolName, direction, maxDepth);
  }

  findPaths(
    fromSymbol: string,
    toSymbol: string,
    maxDepth: number = 10
  ): Result<FindPathsResult, string> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }
    this.ensureCallGraph();
    return this.callGraphService.findPaths(fromSymbol, toSymbol, maxDepth);
  }

  findDeadCode(filePattern?: string): Result<DeadCodeResult, string> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }
    this.ensureCallGraph();
    return this.callGraphService.findDeadCode(filePattern);
  }

  // Private helpers

  private removeFile(relativePath: string): void {
    this.callGraphService.invalidate();
    this.indexedFiles.delete(relativePath);
    const filtered = this.allSymbols.filter((s) => s.filePath !== relativePath);
    this.allSymbols.length = 0;
    this.allSymbols.push(...filtered);
    this.lastIndexTime = new Date();
  }

  private resolvePath(relativePath: string): string {
    if (relativePath.startsWith("/")) return relativePath;
    return `${this.rootPath}/${relativePath}`;
  }

  private async parseAndCache(filePath: string): Promise<Result<ParseResult, Error>> {
    if (!this.fs.exists(filePath)) {
      return Err(new Error(`File not found: ${filePath}`));
    }

    const statsResult = this.fs.stats(filePath);
    if (!statsResult.ok) {
      return Err(statsResult.error);
    }

    const { mtime } = statsResult.value;
    const cached = this.cache.get(filePath, mtime);
    if (cached) {
      return Ok({ tree: cached, errors: [] });
    }

    const sourceResult = this.fs.read(filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error);
    }

    const parseResult = await this.parser.parse(sourceResult.value, filePath);
    if (!parseResult.ok) {
      return parseResult;
    }

    this.cache.set(filePath, mtime, parseResult.value.tree);
    return parseResult;
  }

  private ensureCallGraph(): void {
    if (!this.callGraphService.isBuilt()) {
      this.callGraphService.build({
        indexedFiles: this.indexedFiles,
        resolvePath: (relativePath: string) => this.resolvePath(relativePath),
      });
    }
  }
}

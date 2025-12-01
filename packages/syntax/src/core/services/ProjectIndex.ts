import { Result, Ok, Err } from "../result.js";
import { Parser, ParseResult } from "../ports/Parser.js";
import { FileSystem } from "../ports/FileSystem.js";
import { SymbolCache } from "../ports/Cache.js";
import { ProjectScanner } from "../ports/ProjectScanner.js";
import { SymbolTree, flattenSymbols } from "../symbolTree.js";
import { Symbol, SymbolInfo, SymbolKind, LANGUAGES, SymbolReference } from "../model.js";

export interface IndexedSymbol {
  name: string;
  namePath: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  endLine: number;
}

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
}

/**
 * Manages a cross-file symbol index for a project.
 */
export class ProjectIndex {
  private readonly indexedFiles = new Map<string, SymbolTree>();
  private readonly allSymbols: IndexedSymbol[] = [];
  private rootPath: string = "";
  private lastIndexTime: Date | null = null;

  constructor(
    private readonly parser: Parser,
    private readonly fs: FileSystem,
    private readonly cache: SymbolCache,
    private readonly scanner: ProjectScanner
  ) {}

  /**
   * Index all source files in a project directory.
   */
  async index(rootPath: string): Promise<Result<IndexStats, string>> {
    this.rootPath = rootPath;
    this.indexedFiles.clear();
    this.allSymbols.length = 0;

    // Get all supported extensions
    const extensions = Object.values(LANGUAGES).flatMap((l) => l.extensions);

    // Scan for files
    const scanResult = await this.scanner.scan(rootPath, extensions);
    if (!scanResult.ok) {
      return Err(scanResult.error.message);
    }

    const files = scanResult.value;
    const languages: Record<string, number> = {};
    let parseErrors = 0;

    // Parse each file
    for (const relativePath of files) {
      const fullPath = this.resolvePath(relativePath);
      const parseResult = await this.parseAndCache(fullPath);

      if (parseResult.ok) {
        const tree = parseResult.value.tree;
        this.indexedFiles.set(relativePath, tree);

        // Track language stats
        languages[tree.language] = (languages[tree.language] ?? 0) + 1;

        // Index all symbols
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
      } else {
        parseErrors++;
      }
    }

    this.lastIndexTime = new Date();

    return Ok({
      filesIndexed: this.indexedFiles.size,
      symbolsIndexed: this.allSymbols.length,
      languages,
      lastUpdated: this.lastIndexTime.toISOString(),
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

      // Match by name or namePath
      if (!regex.test(symbol.name) && !regex.test(symbol.namePath)) {
        continue;
      }

      // Filter by kinds if specified
      if (kinds && kinds.length > 0 && !kinds.includes(symbol.kind)) {
        continue;
      }

      results.push(symbol);
    }

    return results;
  }

  /**
   * Get all symbols in a specific file.
   */
  getFileSymbols(relativePath: string): IndexedSymbol[] {
    return this.allSymbols.filter((s) => s.filePath === relativePath);
  }

  /**
   * Get the parsed tree for a file.
   */
  getTree(relativePath: string): SymbolTree | undefined {
    return this.indexedFiles.get(relativePath);
  }

  /**
   * Re-index a single file (after it's been modified).
   */
  async reindexFile(relativePath: string): Promise<Result<void, string>> {
    const fullPath = this.resolvePath(relativePath);

    // Remove old symbols for this file
    const oldSymbolCount = this.allSymbols.length;
    const filtered = this.allSymbols.filter((s) => s.filePath !== relativePath);
    this.allSymbols.length = 0;
    this.allSymbols.push(...filtered);

    // Parse the file
    const parseResult = await this.parseAndCache(fullPath);
    if (!parseResult.ok) {
      this.indexedFiles.delete(relativePath);
      return Err(parseResult.error.message);
    }

    const tree = parseResult.value.tree;
    this.indexedFiles.set(relativePath, tree);

    // Add new symbols
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

  /**
   * Get index statistics.
   */
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
    };
  }

  /**
   * Check if index is empty.
   */
  isEmpty(): boolean {
    return this.indexedFiles.size === 0;
  }

  /**
   * Find all references to a symbol across indexed files.
   * Uses text-based search for the symbol name as an identifier.
   */
  async findReferences(
    symbolName: string,
    definitionFile?: string
  ): Promise<Result<SymbolReference[], string>> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }

    const references: SymbolReference[] = [];

    // Create a regex that matches the symbol name as a whole word (identifier)
    // This is language-agnostic and will have some false positives
    const pattern = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, "g");

    // Search all indexed files
    for (const [relativePath, tree] of this.indexedFiles) {
      const fullPath = this.resolvePath(relativePath);
      const sourceResult = this.fs.read(fullPath);

      if (!sourceResult.ok) continue;

      const source = sourceResult.value;
      const lines = source.split("\n");

      // Check if this file defines the symbol
      const isDefinitionFile = definitionFile
        ? relativePath === definitionFile || fullPath === definitionFile
        : false;

      // Search each line for matches
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;

        // Reset lastIndex for each line
        pattern.lastIndex = 0;

        while ((match = pattern.exec(line)) !== null) {
          const lineNum = i + 1;
          const column = match.index + 1;

          // Check if this is the definition
          const isDefinition = this.isDefinitionLocation(
            relativePath,
            symbolName,
            lineNum
          );

          references.push({
            filePath: relativePath,
            symbolName,
            line: lineNum,
            column,
            context: line.trim(),
            isDefinition,
          });
        }
      }
    }

    // Sort: definitions first, then by file and line
    references.sort((a, b) => {
      if (a.isDefinition !== b.isDefinition) {
        return a.isDefinition ? -1 : 1;
      }
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }
      return a.line - b.line;
    });

    return Ok(references);
  }

  /**
   * Check if a location is a symbol definition.
   */
  private isDefinitionLocation(
    filePath: string,
    symbolName: string,
    line: number
  ): boolean {
    const symbol = this.allSymbols.find(
      (s) =>
        s.filePath === filePath &&
        s.name === symbolName &&
        s.line <= line &&
        s.endLine >= line
    );
    return symbol !== undefined && symbol.line === line;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private resolvePath(relativePath: string): string {
    if (relativePath.startsWith("/")) return relativePath;
    return `${this.rootPath}/${relativePath}`;
  }

  private async parseAndCache(filePath: string): Promise<Result<ParseResult, Error>> {
    // Check file exists
    if (!this.fs.exists(filePath)) {
      return Err(new Error(`File not found: ${filePath}`));
    }

    // Get file stats for cache validation
    const statsResult = this.fs.stats(filePath);
    if (!statsResult.ok) {
      return Err(statsResult.error);
    }

    const { mtime } = statsResult.value;

    // Check cache
    const cached = this.cache.get(filePath, mtime);
    if (cached) {
      return Ok({ tree: cached, errors: [] });
    }

    // Read and parse
    const sourceResult = this.fs.read(filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error);
    }

    const parseResult = await this.parser.parse(sourceResult.value, filePath);
    if (!parseResult.ok) {
      return parseResult;
    }

    // Cache the result
    this.cache.set(filePath, mtime, parseResult.value.tree);

    return parseResult;
  }
}

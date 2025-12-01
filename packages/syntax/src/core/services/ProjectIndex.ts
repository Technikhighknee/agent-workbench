import { type Result, Ok, Err } from "@agent-workbench/core";
import { Parser, ParseResult } from "../ports/Parser.js";
import { FileSystem } from "../ports/FileSystem.js";
import { SymbolCache } from "../ports/Cache.js";
import { ProjectScanner } from "../ports/ProjectScanner.js";
import { FileWatcher } from "../ports/FileWatcher.js";
import { SymbolTree, flattenSymbols } from "../symbolTree.js";
import { SymbolKind, LANGUAGES, SymbolReference, CallSite, DependencyAnalysis, CircularDependency, ImportInfo } from "../model.js";
import path from "path";

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
      watching: this.isWatching(),
    };
  }

  /**
   * Check if index is empty.
   */
  isEmpty(): boolean {
    return this.indexedFiles.size === 0;
  }

  /**
   * Start watching for file changes and auto-reindex.
   */
  startWatching(
    watcher: FileWatcher,
    callback?: (event: string, file: string) => void
  ): Result<void, string> {
    if (!this.rootPath) {
      return Err("No project indexed. Call index first.");
    }

    // Stop any existing watcher
    this.stopWatching();

    this.watcher = watcher;
    this.watchCallback = callback ?? null;

    const extensions = Object.values(LANGUAGES).flatMap((l) => l.extensions);

    const result = watcher.watch(this.rootPath, extensions, async (event, relativePath) => {
      // Handle the event
      if (event === "unlink") {
        // File deleted - remove from index
        this.removeFile(relativePath);
      } else {
        // File added or changed - reindex
        await this.reindexFile(relativePath);
      }

      // Notify callback
      if (this.watchCallback) {
        this.watchCallback(event, relativePath);
      }
    });

    if (!result.ok) {
      return Err(result.error.message);
    }

    return Ok(undefined);
  }

  /**
   * Stop watching for file changes.
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
      this.watchCallback = null;
    }
  }

  /**
   * Check if currently watching for changes.
   */
  isWatching(): boolean {
    return this.watcher !== null && this.watcher.isWatching();
  }

  /**
   * Remove a file from the index.
   */
  private removeFile(relativePath: string): void {
    this.indexedFiles.delete(relativePath);

    // Remove symbols for this file
    const filtered = this.allSymbols.filter((s) => s.filePath !== relativePath);
    this.allSymbols.length = 0;
    this.allSymbols.push(...filtered);

    this.lastIndexTime = new Date();
  }

  /**
   * Find all references to a symbol across indexed files.
   * Uses text-based search for the symbol name as an identifier.
   */
  async findReferences(
    symbolName: string,
    _definitionFile?: string
  ): Promise<Result<SymbolReference[], string>> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }

    const references: SymbolReference[] = [];

    // Create a regex that matches the symbol name as a whole word (identifier)
    // This is language-agnostic and will have some false positives
    const pattern = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, "g");

    // Search all indexed files
    for (const [relativePath] of this.indexedFiles) {
      const fullPath = this.resolvePath(relativePath);
      const sourceResult = this.fs.read(fullPath);

      if (!sourceResult.ok) continue;

      const source = sourceResult.value;
      const lines = source.split("\n");

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
   * Get all functions/methods that call the given symbol.
   * Returns the call sites where the symbol is invoked.
   */
  async getCallers(symbolName: string): Promise<Result<CallSite[], string>> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }

    const callers: CallSite[] = [];

    // Patterns that indicate a function/method declaration rather than a call
    const declarationPatterns = [
      /\bfunction\s+$/,
      /\basync\s+function\s+$/,
      /\bclass\s+$/,
      /\binterface\s+$/,
      /\btype\s+$/,
      /\bconst\s+$/,
      /\blet\s+$/,
      /\bvar\s+$/,
      /\bexport\s+function\s+$/,
      /\bexport\s+async\s+function\s+$/,
      /\bexport\s+default\s+function\s+$/,
      /\bexport\s+class\s+$/,
      /\bexport\s+interface\s+$/,
      /\bexport\s+type\s+$/,
    ];

    // Search all indexed files for calls to this symbol
    for (const [relativePath, tree] of this.indexedFiles) {
      const fullPath = this.resolvePath(relativePath);
      const sourceResult = this.fs.read(fullPath);
      if (!sourceResult.ok) continue;

      const source = sourceResult.value;
      const lines = source.split("\n");

      // Find all functions/methods in this file
      const flattened = flattenSymbols(tree);
      const callableSymbols = flattened.filter(({ symbol }) =>
        symbol.kind === "function" || symbol.kind === "method"
      );

      // For each callable, check if it calls our target
      for (const { symbol, namePath } of callableSymbols) {
        // Skip if this IS the symbol we're looking for (don't report definition as caller)
        if (symbol.name === symbolName) continue;

        // Extract the body of this symbol
        const startLine = symbol.span.start.line;
        const endLine = symbol.span.end.line;
        const body = lines.slice(startLine - 1, endLine).join("\n");

        // Search for calls to the target symbol
        const callPattern = new RegExp(
          `(?:^|[^\\w])${this.escapeRegex(symbolName)}\\s*\\(`,
          "gm"
        );

        let match: RegExpExecArray | null;
        while ((match = callPattern.exec(body)) !== null) {
          // Check if this is a declaration rather than a call
          const beforeMatch = body.slice(0, match.index + 1).trimEnd();
          const isDeclaration = declarationPatterns.some(pattern => 
            pattern.test(beforeMatch)
          );
          
          if (isDeclaration) continue;

          // Calculate the actual line number
          const beforeMatchFull = body.slice(0, match.index);
          const lineOffset = (beforeMatchFull.match(/\n/g) || []).length;
          const callLine = startLine + lineOffset;

          callers.push({
            filePath: relativePath,
            line: callLine,
            column: 1, // Approximate
            fromSymbol: namePath,
            context: lines[callLine - 1]?.trim() || "",
          });
        }
      }
    }

    // Sort by file and line
    callers.sort((a, b) => {
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }
      return a.line - b.line;
    });

    return Ok(callers);
  }

  /**
   * Get all functions/methods called by the given symbol.
   * Requires the symbol's file path and name path.
   */
  async getCallees(
    filePath: string,
    symbolNamePath: string
  ): Promise<Result<CallSite[], string>> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }

    // Resolve the file path
    const relativePath = filePath.startsWith(this.rootPath)
      ? filePath.slice(this.rootPath.length + 1)
      : filePath;

    const tree = this.indexedFiles.get(relativePath);
    if (!tree) {
      return Err(`File not indexed: ${filePath}`);
    }

    // Find the symbol
    const flattened = flattenSymbols(tree);
    const symbolEntry = flattened.find(({ namePath }) => namePath === symbolNamePath);
    if (!symbolEntry) {
      return Err(`Symbol not found: ${symbolNamePath}`);
    }

    const { symbol } = symbolEntry;
    const fullPath = this.resolvePath(relativePath);
    const sourceResult = this.fs.read(fullPath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error.message);
    }

    const source = sourceResult.value;
    const lines = source.split("\n");

    // Extract the body of this symbol (skip the first line which is the declaration)
    const startLine = symbol.span.start.line;
    const endLine = symbol.span.end.line;
    
    // Skip the declaration line to avoid matching the function's own name
    const bodyStartLine = startLine + 1;
    if (bodyStartLine > endLine) {
      // Single-line function or no body
      return Ok([]);
    }
    
    const body = lines.slice(bodyStartLine - 1, endLine).join("\n");

    // Find all function calls in the body using a regex
    // This matches: identifier( or .identifier(
    const callPattern = /(?:^|[^\w])(\w+)\s*\(/gm;
    const callees: CallSite[] = [];
    const seenCalls = new Set<string>();

    // Keywords and patterns to skip
    const skipPatterns = new Set([
      "if", "for", "while", "switch", "catch", "function", "return",
      "async", "await", "new", "typeof", "instanceof", "class", "interface",
      "type", "const", "let", "var", "export", "import"
    ]);

    let match: RegExpExecArray | null;
    while ((match = callPattern.exec(body)) !== null) {
      const calleeName = match[1];

      // Skip common non-function patterns
      if (skipPatterns.has(calleeName)) {
        continue;
      }

      // Skip the function's own name (recursive calls are ok, but not the definition)
      // This is an extra safeguard
      if (calleeName === symbol.name) {
        // Check if this looks like a recursive call (not a declaration)
        const contextLine = lines[bodyStartLine - 1 + Math.floor(match.index / 100)]?.trim() || "";
        if (contextLine.startsWith("function ") || contextLine.startsWith("async function ")) {
          continue;
        }
      }

      // Calculate the actual line number
      const beforeMatch = body.slice(0, match.index);
      const lineOffset = (beforeMatch.match(/\n/g) || []).length;
      const callLine = bodyStartLine + lineOffset;

      // Dedupe by name (we just want to know what's called, not every instance)
      const key = `${calleeName}:${callLine}`;
      if (seenCalls.has(key)) continue;
      seenCalls.add(key);

      callees.push({
        filePath: relativePath,
        line: callLine,
        column: 1, // Approximate
        fromSymbol: calleeName,
        context: lines[callLine - 1]?.trim() || "",
      });
    }

    return Ok(callees);
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

  /**
   * Analyze dependencies across all indexed files.
   * Detects circular dependencies and provides dependency statistics.
   */
  async analyzeDependencies(): Promise<Result<DependencyAnalysis, string>> {
    if (this.isEmpty()) {
      return Err("No project indexed. Call index first.");
    }

    // Build dependency graph
    const graph = new Map<string, { deps: Set<string>; imports: ImportInfo[] }>();
    const dependents = new Map<string, Set<string>>();
    let totalImports = 0;

    // Initialize all indexed files
    for (const [relativePath] of this.indexedFiles) {
      graph.set(relativePath, { deps: new Set(), imports: [] });
      dependents.set(relativePath, new Set());
    }

    // Extract imports from each file
    for (const [relativePath] of this.indexedFiles) {
      const fullPath = this.resolvePath(relativePath);
      const sourceResult = this.fs.read(fullPath);
      if (!sourceResult.ok) continue;

      const importsResult = await this.parser.extractImports(sourceResult.value, fullPath);
      if (!importsResult.ok) continue;

      const imports = importsResult.value;
      totalImports += imports.length;

      const entry = graph.get(relativePath)!;
      entry.imports = imports;

      for (const imp of imports) {
        // Resolve the import to a file path
        const resolved = this.resolveImportPath(relativePath, imp.source);
        if (resolved && graph.has(resolved)) {
          entry.deps.add(resolved);
          dependents.get(resolved)?.add(relativePath);
        }
      }
    }

    // Find circular dependencies using DFS
    const circularDependencies: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const detectCycle = (file: string): void => {
      visited.add(file);
      recursionStack.add(file);
      path.push(file);

      const entry = graph.get(file);
      if (entry) {
        for (const dep of entry.deps) {
          if (!visited.has(dep)) {
            detectCycle(dep);
          } else if (recursionStack.has(dep)) {
            // Found a cycle
            const cycleStart = path.indexOf(dep);
            const cycle = path.slice(cycleStart);
            cycle.push(dep); // Close the cycle

            // Find the import that closes the cycle
            const fromFile = path[path.length - 1];
            const fromEntry = graph.get(fromFile);
            const closingImport = fromEntry?.imports.find((i) =>
              this.resolveImportPath(fromFile, i.source) === dep
            );

            circularDependencies.push({
              cycle,
              closingImport: {
                from: fromFile,
                to: dep,
                line: closingImport?.line ?? 0,
              },
            });
          }
        }
      }

      path.pop();
      recursionStack.delete(file);
    };

    for (const [file] of graph) {
      if (!visited.has(file)) {
        detectCycle(file);
      }
    }

    // Calculate statistics
    const depCounts: { file: string; count: number }[] = [];
    const importedCounts: { file: string; count: number }[] = [];

    for (const [file, entry] of graph) {
      depCounts.push({ file, count: entry.deps.size });
    }

    for (const [file, deps] of dependents) {
      importedCounts.push({ file, count: deps.size });
    }

    // Sort and take top 10
    depCounts.sort((a, b) => b.count - a.count);
    importedCounts.sort((a, b) => b.count - a.count);

    return Ok({
      totalFiles: this.indexedFiles.size,
      totalImports,
      highestDependencyCount: depCounts.slice(0, 10),
      mostImported: importedCounts.slice(0, 10),
      circularDependencies,
      hasCircularDependencies: circularDependencies.length > 0,
    });
  }

  /**
   * Resolve an import specifier to a file path relative to project root.
   */
  private resolveImportPath(fromFile: string, importSource: string): string | null {
    // Only resolve relative imports
    if (!importSource.startsWith(".")) {
      return null; // External package
    }

    const fromDir = path.dirname(fromFile);
    let resolved = path.normalize(path.join(fromDir, importSource));

    // Try common extensions if no extension present
    if (!path.extname(resolved)) {
      const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
      for (const ext of extensions) {
        if (this.indexedFiles.has(resolved + ext)) {
          return resolved + ext;
        }
      }
      // Try index files
      for (const ext of extensions) {
        const indexPath = path.join(resolved, "index" + ext);
        if (this.indexedFiles.has(indexPath)) {
          return indexPath;
        }
      }
    }

    // Remove .js extension and try .ts (common in ESM projects)
    if (resolved.endsWith(".js")) {
      const tsPath = resolved.slice(0, -3) + ".ts";
      if (this.indexedFiles.has(tsPath)) {
        return tsPath;
      }
    }

    return this.indexedFiles.has(resolved) ? resolved : null;
  }
}

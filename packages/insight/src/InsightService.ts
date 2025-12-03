/**
 * InsightService - Provides comprehensive code understanding.
 *
 * This service synthesizes information from multiple sources:
 * - Syntax analysis (structure, symbols, imports/exports)
 * - Project indexing (cross-file relationships, call graph)
 * - Git history (recent changes, blame)
 *
 * Everything is computed fresh from current code - nothing stored.
 */

import { type Result, Ok, Err } from "@agent-workbench/core";
import {
  SyntaxService,
  ProjectIndex,
  TreeSitterParser,
  NodeFileSystem,
  InMemoryCache,
  NodeProjectScanner,
  flattenSymbols,
} from "@agent-workbench/syntax";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { execSync } from "node:child_process";
import type {
  Insight,
  FileInsight,
  DirectoryInsight,
  SymbolInsight,
  InsightOptions,
  SymbolRef,
  Dependency,
  CallRelation,
  RecentChange,
  ComplexityMetrics,
} from "./model.js";
import { DEFAULT_OPTIONS } from "./model.js";

export class InsightService {
  private readonly syntax: SyntaxService;
  private readonly index: ProjectIndex;
  private readonly parser: TreeSitterParser;
  private readonly fs: NodeFileSystem;
  private readonly rootPath: string;
  private initialized = false;

  constructor(rootPath: string) {
    this.rootPath = rootPath;

    // Create infrastructure
    this.parser = new TreeSitterParser();
    this.fs = new NodeFileSystem();
    const cache = new InMemoryCache();
    const scanner = new NodeProjectScanner();

    // Create services
    this.syntax = new SyntaxService(this.parser, this.fs, cache);
    this.index = new ProjectIndex(this.parser, this.fs, cache, scanner);
  }

  /**
   * Initialize the service (indexes the project).
   */
  async initialize(): Promise<Result<void, string>> {
    if (this.initialized) return Ok(undefined);

    const result = await this.index.index(this.rootPath);
    if (!result.ok) {
      return Err(result.error);
    }

    this.initialized = true;
    return Ok(undefined);
  }

  /**
   * Get comprehensive insight about a target.
   * Target can be a file path, directory path, or symbol name.
   */
  async getInsight(
    target: string,
    options: InsightOptions = {}
  ): Promise<Result<Insight, string>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Ensure initialized
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) return initResult;
    }

    // Resolve the target
    const resolved = this.resolveTarget(target);

    switch (resolved.type) {
      case "file":
        return this.getFileInsight(resolved.path!, opts);
      case "directory":
        return this.getDirectoryInsight(resolved.path!, opts);
      case "symbol":
        return this.getSymbolInsight(resolved.name!, opts);
      case "unknown":
        // Try as symbol anyway - getSymbolInsight has better error messages with suggestions
        return this.getSymbolInsight(target, opts);
    }
  }

  /**
   * Resolve a target string to a specific type.
   */
  private resolveTarget(target: string): {
    type: "file" | "directory" | "symbol" | "unknown";
    path?: string;
    name?: string;
  } {
    // Try as absolute path first
    if (target.startsWith("/")) {
      if (existsSync(target)) {
        const stat = statSync(target);
        return stat.isDirectory()
          ? { type: "directory", path: target }
          : { type: "file", path: target };
      }
    }

    // Try as relative path
    const fullPath = join(this.rootPath, target);
    if (existsSync(fullPath)) {
      const stat = statSync(fullPath);
      return stat.isDirectory()
        ? { type: "directory", path: fullPath }
        : { type: "file", path: fullPath };
    }

    // Try as symbol name
    const symbols = this.index.searchSymbols({ pattern: `^${target}$` });
    if (symbols.length > 0) {
      return { type: "symbol", name: target };
    }

    // Try partial match
    const partialSymbols = this.index.searchSymbols({ pattern: target });
    if (partialSymbols.length > 0) {
      return { type: "symbol", name: partialSymbols[0].name };
    }

    return { type: "unknown" };
  }

  /**
   * Get insight about a file.
   */
  private async getFileInsight(
    filePath: string,
    opts: Required<InsightOptions>
  ): Promise<Result<FileInsight, string>> {
    const relativePath = relative(this.rootPath, filePath);

    // Read and parse file
    const sourceResult = this.fs.read(filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error.message);
    }

    const parseResult = await this.parser.parse(sourceResult.value, filePath);
    if (!parseResult.ok) {
      return Err(parseResult.error.message);
    }

    const tree = parseResult.value.tree;
    const symbols = flattenSymbols(tree);

    // Get imports and exports
    const importsResult = await this.syntax.getImports(filePath);
    const exportsResult = await this.syntax.getExports(filePath);

    const imports: Dependency[] = importsResult.ok
      ? importsResult.value.map((imp) => ({
          source: imp.source,
          names: imp.bindings.map((b) => b.name),
          isTypeOnly: imp.type === "type",
        }))
      : [];

    const exports: string[] = exportsResult.ok
      ? exportsResult.value.flatMap((exp) => exp.bindings.map((b) => b.name))
      : [];

    // Find who imports this file
    const importedBy = this.findImportersOf(relativePath);

    // Extract import sources
    const importsFrom = imports
      .map((imp) => imp.source)
      .filter((s) => s.startsWith("."));

    // Get recent changes
    const recentChanges = this.getRecentChangesForFile(
      filePath,
      opts.maxChanges
    );

    // Calculate metrics
    const lines = sourceResult.value.split("\n").length;
    const complexity = lines > 500 || symbols.length > 30
      ? "high"
      : lines > 150 || symbols.length > 15
      ? "medium"
      : "low";

    const metrics: ComplexityMetrics = {
      lines,
      symbols: symbols.length,
      imports: imports.length,
      exports: exports.length,
      complexity,
    };

    // Generate summary
    const summary = this.generateFileSummary(tree.language, symbols, exports);

    // Collect notes
    const notes = this.collectFileNotes(metrics);

    return Ok({
      type: "file",
      path: filePath,
      language: tree.language,
      summary,
      structure: {
        symbols: symbols.map(({ symbol }) => ({
          name: symbol.name,
          kind: symbol.kind,
          file: relativePath,
          line: symbol.span.start.line,
        })),
        imports,
        exports,
      },
      relationships: {
        importedBy,
        importsFrom,
      },
      recentChanges,
      metrics,
      notes,
    });
  }

  /**
   * Get insight about a directory.
   */
  private async getDirectoryInsight(
    dirPath: string,
    opts: Required<InsightOptions>
  ): Promise<Result<DirectoryInsight, string>> {
    const relativePath = relative(this.rootPath, dirPath);

    // List direct subdirectories (for structure display)
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const subdirectories = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
      .map((e) => e.name);

    // Recursively collect ALL source files (excluding test files for main metrics)
    const allFiles = this.collectFilesRecursively(dirPath);
    const sourceFiles = allFiles.filter((f) => !f.relativePath.includes("test/") && !f.relativePath.endsWith(".test.ts") && !f.relativePath.endsWith(".spec.ts"));
    const testFiles = allFiles.filter((f) => f.relativePath.includes("test/") || f.relativePath.endsWith(".test.ts") || f.relativePath.endsWith(".spec.ts"));
    const fileNames = allFiles.map((f) => f.relativePath);

    // Find entry points - check root and src/ directory
    const entryPointNames = ["index.ts", "index.js", "mod.ts", "main.ts"];
    const entryPoints: string[] = [];
    
    // Check root level
    for (const name of entryPointNames) {
      if (entries.some((e) => e.isFile() && e.name === name)) {
        entryPoints.push(name);
      }
    }
    
    // Check src/ subdirectory if exists
    if (subdirectories.includes("src")) {
      const srcPath = join(dirPath, "src");
      try {
        const srcEntries = readdirSync(srcPath, { withFileTypes: true });
        for (const name of entryPointNames) {
          if (srcEntries.some((e) => e.isFile() && e.name === name)) {
            entryPoints.push(`src/${name}`);
          }
        }
      } catch { /* ignore */ }
    }

    // Collect key symbols from source files (not test files)
    const keySymbols: SymbolRef[] = [];
    const allImports: Set<string> = new Set();
    const internalDeps: Set<string> = new Set();
    let totalLines = 0;
    let totalSymbols = 0;

    for (const file of sourceFiles) {
      const sourceResult = this.fs.read(file.absolutePath);
      if (!sourceResult.ok) continue;

      const parseResult = await this.parser.parse(sourceResult.value, file.absolutePath);
      if (!parseResult.ok) continue;

      const tree = parseResult.value.tree;
      const symbols = flattenSymbols(tree);
      totalLines += sourceResult.value.split("\n").length;
      totalSymbols += symbols.length;

      // Get exported symbols as key symbols
      const exportsResult = await this.syntax.getExports(file.absolutePath);
      if (exportsResult.ok) {
        for (const exp of exportsResult.value) {
          for (const binding of exp.bindings) {
            const sym = symbols.find(({ symbol }) => symbol.name === binding.name);
            if (sym) {
              keySymbols.push({
                name: sym.symbol.name,
                kind: sym.symbol.kind,
                file: join(relativePath, file.relativePath),
                line: sym.symbol.span.start.line,
              });
            }
          }
        }
      }

      // Track imports
      const importsResult = await this.syntax.getImports(file.absolutePath);
      if (importsResult.ok) {
        for (const imp of importsResult.value) {
          if (!imp.source.startsWith(".")) {
            allImports.add(imp.source);
          } else {
            // Resolve internal dependency
            const resolved = this.resolveImportPath(dirname(file.absolutePath), imp.source);
            if (resolved) {
              const relDir = dirname(relative(this.rootPath, resolved));
              if (relDir !== relativePath && !relDir.startsWith(relativePath)) {
                internalDeps.add(relDir);
              }
            }
          }
        }
      }
    }

    // Find who depends on this directory
    const dependents = this.findDependentsOf(relativePath);

    // Get recent changes
    const recentChanges = this.getRecentChangesForDirectory(
      dirPath,
      opts.maxChanges
    );

    // Calculate aggregate metrics (source files only)
    const complexity = totalLines > 1000 ? "high" : totalLines > 300 ? "medium" : "low";
    const metrics: ComplexityMetrics = {
      lines: totalLines,
      symbols: totalSymbols,
      imports: allImports.size,
      exports: keySymbols.length,
      complexity,
    };

    // Generate summary
    const summary = this.generateDirectorySummary(
      relativePath,
      sourceFiles.length,
      keySymbols
    );

    // Collect notes
    const notes: string[] = [];
    if (entryPoints.length === 0 && sourceFiles.length > 0) {
      notes.push("No index/entry point file found");
    }
    if (metrics.complexity === "high") {
      notes.push("High complexity - consider refactoring");
    }
    const nestedSourceCount = sourceFiles.filter((f) => f.relativePath.includes("/")).length;
    if (subdirectories.length > 0 && nestedSourceCount > 0) {
      notes.push(`Includes ${subdirectories.length} subdirectories with ${nestedSourceCount} nested source files`);
    }
    if (testFiles.length > 0) {
      notes.push(`${testFiles.length} test file(s) not included in metrics`);
    }

    return Ok({
      type: "directory",
      path: dirPath,
      summary,
      structure: {
        files: fileNames,
        subdirectories,
        entryPoints,
        keySymbols: keySymbols.slice(0, 20), // Limit to top 20
      },
      relationships: {
        externalDeps: Array.from(allImports),
        internalDeps: Array.from(internalDeps),
        dependents,
      },
      recentChanges,
      metrics,
      notes,
    });
  }

  /**
   * Get insight about a symbol.
   */
  private async getSymbolInsight(
    symbolName: string,
    opts: Required<InsightOptions>
  ): Promise<Result<SymbolInsight, string>> {
    // Find the symbol (exact match)
    const symbols = this.index.searchSymbols({ pattern: `^${symbolName}$` });
    if (symbols.length === 0) {
      // Try partial match to give helpful suggestions
      const partial = this.index.searchSymbols({ pattern: symbolName });
      if (partial.length > 0) {
        const suggestions = partial.slice(0, 5).map((s) => `  - ${s.name} (${s.kind}) in ${s.filePath}`).join("\n");
        return Err(`Symbol "${symbolName}" not found exactly, but found similar:\n${suggestions}\n\nTry one of these names or use the file path.`);
      }
      return Err(`Symbol not found: "${symbolName}". The symbol may not be exported, or the file hasn't been indexed. Try using a file path instead.`);
    }

    // If multiple matches, return disambiguation info
    if (symbols.length > 1) {
      const matches = symbols.map((s) => `- ${s.name} (${s.kind}) in ${s.filePath}:${s.line}`).join("\n");
      return Err(`Multiple symbols named "${symbolName}" found. Be more specific:\n${matches}\n\nTry using the file path instead, e.g., insight({ target: "${symbols[0].filePath}" })`);
    }

    const symbol = symbols[0];
    const filePath = join(this.rootPath, symbol.filePath);

    // Read the symbol's code
    const readResult = await this.syntax.readSymbol({
      filePath,
      namePath: symbol.namePath,
      context: 0,
    });
    if (!readResult.ok) {
      return Err(readResult.error);
    }

    const code = readResult.value.body;

    // Get callers and callees if requested
    let calls: CallRelation[] = [];
    let calledBy: CallRelation[] = [];

    if (opts.includeCallGraph) {
      const calleesResult = await this.index.getCallees(
        symbol.filePath,
        symbol.namePath
      );
      if (calleesResult.ok) {
        calls = calleesResult.value.map((c) => ({
          symbol: {
            name: c.fromSymbol ?? "unknown",
            kind: "function",
            file: c.filePath,
            line: c.line,
          },
          line: c.line,
          context: c.context,
        }));
      }

      const callersResult = await this.index.getCallers(symbol.name);
      if (callersResult.ok) {
        // Deduplicate callers by fromSymbol + file (same function may call multiple times)
        const seen = new Set<string>();
        calledBy = callersResult.value
          .filter((c) => {
            const key = `${c.fromSymbol}@${c.filePath}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((c) => ({
            symbol: {
              name: c.fromSymbol ?? "unknown",
              kind: "function",
              file: c.filePath,
              line: c.line,
            },
            line: c.line,
            context: c.context,
          }));
      }
    }

    // Find related symbols (same file, similar names)
    const related = this.findRelatedSymbols(symbol);

    // Get recent changes
    const recentChanges = this.getRecentChangesForSymbol(
      filePath,
      symbol.line,
      opts.maxChanges
    );

    // Generate summary
    const summary = this.generateSymbolSummary(symbol, code);

    // Extract signature for functions
    const signature = this.extractSignature(code, symbol.kind);

    // Collect notes
    const notes = this.collectSymbolNotes(symbol, calls, calledBy);

    return Ok({
      type: "symbol",
      name: symbol.name,
      namePath: symbol.namePath,
      kind: symbol.kind,
      file: filePath,
      line: symbol.line,
      summary,
      code: opts.includeCode ? code : "",
      signature,
      relationships: {
        calls: calls.slice(0, 10),
        calledBy: calledBy.slice(0, 10),
        related: related.slice(0, 10),
      },
      recentChanges,
      notes,
    });
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private isSourceFile(name: string): boolean {
    return /\.(ts|tsx|js|jsx|py|go|rs)$/.test(name);
  }

  /**
   * Recursively collect all source files in a directory
   */
  private collectFilesRecursively(
    dirPath: string,
    basePath: string = dirPath
  ): { relativePath: string; absolutePath: string }[] {
    const results: { relativePath: string; absolutePath: string }[] = [];
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isFile() && this.isSourceFile(entry.name)) {
        results.push({
          relativePath: relative(basePath, fullPath),
          absolutePath: fullPath,
        });
      } else if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== "dist"
      ) {
        results.push(...this.collectFilesRecursively(fullPath, basePath));
      }
    }

    return results;
  }

  private resolveImportPath(fromDir: string, importSource: string): string | null {
    if (!importSource.startsWith(".")) return null;

    const resolved = join(fromDir, importSource);
    const extensions = [".ts", ".tsx", ".js", ".jsx"];

    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (existsSync(withExt)) return withExt;
    }

    for (const ext of extensions) {
      const indexPath = join(resolved, `index${ext}`);
      if (existsSync(indexPath)) return indexPath;
    }

    return null;
  }

  private findImportersOf(relativePath: string): string[] {
    const importers: string[] = [];
    const dirName = dirname(relativePath);

    for (const file of this.index.getIndexedFiles()) {
      if (file === relativePath) continue;

      // This is a simplified check - ideally we'd parse imports
      const fileDir = dirname(file);
      if (fileDir === dirName || fileDir.startsWith(dirName)) {
        importers.push(file);
      }
    }

    return importers.slice(0, 10);
  }

  private findDependentsOf(relativePath: string): string[] {
    const dependents: string[] = [];

    for (const file of this.index.getIndexedFiles()) {
      const fileDir = dirname(file);
      if (fileDir === relativePath) continue;

      if (!file.startsWith(relativePath)) {
        dependents.push(dirname(file));
      }
    }

    return [...new Set(dependents)].slice(0, 10);
  }

  private findRelatedSymbols(symbol: {
    name: string;
    filePath: string;
    kind: string;
  }): SymbolRef[] {
    const related: SymbolRef[] = [];

    const fileSymbols = this.index.getFileSymbols(symbol.filePath);
    for (const s of fileSymbols) {
      if (s.name !== symbol.name) {
        related.push({
          name: s.name,
          kind: s.kind,
          file: s.filePath,
          line: s.line,
        });
      }
    }

    return related;
  }

  private getRecentChangesForFile(
    filePath: string,
    maxChanges: number
  ): RecentChange[] {
    try {
      const relativePath = relative(this.rootPath, filePath);
      const output = execSync(
        `git log -${maxChanges} --format="%h|||%an|||%s|||%cr" -- "${relativePath}"`,
        { cwd: this.rootPath, encoding: "utf-8" }
      );

      return output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, author, message, date] = line.split("|||");
          return { hash, author, message, date };
        });
    } catch {
      return [];
    }
  }

  private getRecentChangesForDirectory(
    dirPath: string,
    maxChanges: number
  ): RecentChange[] {
    try {
      const relativePath = relative(this.rootPath, dirPath);
      const output = execSync(
        `git log -${maxChanges} --format="%h|||%an|||%s|||%cr" -- "${relativePath}"`,
        { cwd: this.rootPath, encoding: "utf-8" }
      );

      return output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, author, message, date] = line.split("|||");
          return { hash, author, message, date };
        });
    } catch {
      return [];
    }
  }

  private getRecentChangesForSymbol(
    filePath: string,
    _line: number, // TODO: Could filter by line range in future
    maxChanges: number
  ): RecentChange[] {
    // Fall back to file history for simplicity
    return this.getRecentChangesForFile(filePath, maxChanges);
  }

  private generateFileSummary(
    language: string,
    symbols: Array<{ symbol: { name: string; kind: string } }>,
    exports: string[]
  ): string {
    const classes = symbols.filter((s) => s.symbol.kind === "class");
    const functions = symbols.filter((s) => s.symbol.kind === "function");
    const interfaces = symbols.filter((s) => s.symbol.kind === "interface");
    const typeAliases = symbols.filter((s) => s.symbol.kind === "type_alias");
    const variables = symbols.filter((s) => s.symbol.kind === "variable" || s.symbol.kind === "constant");

    const parts: string[] = [];

    if (classes.length > 0) {
      parts.push(
        `Defines ${classes.length} class${classes.length > 1 ? "es" : ""}: ${classes
          .slice(0, 3)
          .map((c) => c.symbol.name)
          .join(", ")}${classes.length > 3 ? "..." : ""}`
      );
    }

    if (functions.length > 0 && classes.length === 0) {
      parts.push(
        `Contains ${functions.length} function${functions.length > 1 ? "s" : ""}`
      );
    }

    if (interfaces.length > 0) {
      parts.push(
        `Defines ${interfaces.length} interface${interfaces.length > 1 ? "s" : ""}`
      );
    }

    if (typeAliases.length > 0) {
      parts.push(
        `Defines ${typeAliases.length} type${typeAliases.length > 1 ? "s" : ""}`
      );
    }

    if (variables.length > 0 && classes.length === 0 && functions.length === 0) {
      parts.push(
        `Exports ${variables.length} variable${variables.length > 1 ? "s" : ""}`
      );
    }

    if (exports.length > 0) {
      parts.push(`Exports: ${exports.slice(0, 5).join(", ")}${exports.length > 5 ? "..." : ""}`);
    }

    return parts.join(". ") || `${language} source file`;
  }

  private generateDirectorySummary(
    relativePath: string,
    fileCount: number,
    keySymbols: SymbolRef[]
  ): string {
    const moduleName = basename(relativePath);
    const mainClasses = keySymbols.filter((s) => s.kind === "class").slice(0, 3);

    if (mainClasses.length > 0) {
      return `${moduleName} module with ${fileCount} files. Main classes: ${mainClasses
        .map((c) => c.name)
        .join(", ")}`;
    }

    return `${moduleName} module containing ${fileCount} source files and ${keySymbols.length} exported symbols`;
  }

  private generateSymbolSummary(
    symbol: { name: string; kind: string },
    code: string
  ): string {
    const lines = code.split("\n").length;

    switch (symbol.kind) {
      case "class":
        return `Class ${symbol.name} (${lines} lines)`;
      case "function":
        return `Function ${symbol.name} (${lines} lines)`;
      case "method":
        return `Method ${symbol.name} (${lines} lines)`;
      case "interface":
        return `Interface ${symbol.name}`;
      case "type_alias":
        return `Type alias ${symbol.name}`;
      default:
        return `${symbol.kind} ${symbol.name}`;
    }
  }

  private extractSignature(code: string, kind: string): string | undefined {
    // For type aliases and interfaces, the whole thing is the "signature"
    if (kind === "type_alias" || kind === "interface") {
      // For short definitions, return the whole thing
      const lines = code.split("\n");
      if (lines.length <= 5) {
        return code.trim();
      }
      // For longer ones, just return the first line with ...
      return lines[0].trim() + " ...";
    }

    // For classes, return the class declaration line
    if (kind === "class") {
      const firstLine = code.split("\n")[0];
      return firstLine.trim();
    }

    // For functions/methods, extract everything before the body
    if (kind !== "function" && kind !== "method") return undefined;

    // Find the signature - everything before the function body
    // Handle multi-line signatures by finding the opening brace
    const lines = code.split("\n");
    let signature = "";
    let braceDepth = 0;
    let parenDepth = 0;
    
    for (const line of lines) {
      for (const char of line) {
        if (char === "(") parenDepth++;
        if (char === ")") parenDepth--;
        if (char === "{") {
          braceDepth++;
          if (braceDepth === 1 && parenDepth === 0) {
            // Found the opening brace of the function body
            return signature.trim();
          }
        }
      }
      signature += (signature ? "\n" : "") + line;
    }
    
    // Fallback: return first line
    return lines[0].trim();
  }

  private collectFileNotes(metrics: ComplexityMetrics): string[] {
    const notes: string[] = [];

    if (metrics.complexity === "high") {
      notes.push("High complexity - consider splitting into smaller modules");
    }

    if (metrics.exports === 0) {
      notes.push("No exports - file may be an entry point or unused");
    }

    return notes;
  }

  private collectSymbolNotes(
    symbol: { name: string; kind: string },
    calls: CallRelation[],
    calledBy: CallRelation[]
  ): string[] {
    const notes: string[] = [];

    if (calledBy.length === 0 && symbol.kind === "function") {
      notes.push("Not called from indexed code - may be unused or an entry point");
    }

    if (calls.length > 10) {
      notes.push("High coupling - calls many other functions");
    }

    if (calledBy.length > 20) {
      notes.push("Heavily used - changes may have wide impact");
    }

    return notes;
  }
}

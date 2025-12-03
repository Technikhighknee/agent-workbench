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

import { Err, Ok, Result } from "@agent-workbench/core";
import {
  flattenSymbols,
  InMemoryCache,
  NodeFileSystem,
  NodeProjectScanner,
  ProjectIndex,
  SyntaxService,
  TreeSitterParser,
} from "@agent-workbench/syntax";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  collectFileNotes,
  collectSymbolNotes,
  extractSignature,
  generateDirectorySummary,
  generateFileSummary,
  generateSymbolSummary,
} from "./InsightUtils.js";
import {
  getRecentChangesForDirectory,
  getRecentChangesForFile,
  getRecentChangesForSymbol,
} from "./GitHistory.js";
import {
  DEFAULT_OPTIONS,
  type CallRelation,
  type ComplexityMetrics,
  type Dependency,
  type DirectoryInsight,
  type FileInsight,
  type Insight,
  type InsightOptions,
  type SymbolInsight,
  type SymbolRef,
} from "./model.js";

export class InsightService {
  private readonly syntax: SyntaxService;
  private readonly index: ProjectIndex;
  private readonly parser: TreeSitterParser;
  private readonly fs: NodeFileSystem;
  private readonly rootPath: string;
  private initialized = false;

  constructor(rootPath: string) {
    this.rootPath = rootPath;

    this.parser = new TreeSitterParser();
    this.fs = new NodeFileSystem();
    const cache = new InMemoryCache();
    const scanner = new NodeProjectScanner();

    this.syntax = new SyntaxService(this.parser, this.fs, cache);
    this.index = new ProjectIndex(this.parser, this.fs, cache, scanner);
  }

  async initialize(): Promise<Result<void, string>> {
    if (this.initialized) return Ok(undefined);

    const result = await this.index.index(this.rootPath);
    if (!result.ok) {
      return Err(result.error);
    }

    this.initialized = true;
    return Ok(undefined);
  }

  async getInsight(
    target: string,
    options: InsightOptions = {}
  ): Promise<Result<Insight, string>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) return initResult;
    }

    const resolved = this.resolveTarget(target);

    switch (resolved.type) {
      case "file":
        return this.getFileInsight(resolved.path!, opts);
      case "directory":
        return this.getDirectoryInsight(resolved.path!, opts);
      case "symbol":
        return this.getSymbolInsight(resolved.name!, opts);
      case "unknown":
        return this.getSymbolInsight(target, opts);
    }
  }

  private resolveTarget(target: string): {
    type: "file" | "directory" | "symbol" | "unknown";
    path?: string;
    name?: string;
  } {
    if (target.startsWith("/")) {
      if (existsSync(target)) {
        const stat = statSync(target);
        return stat.isDirectory()
          ? { type: "directory", path: target }
          : { type: "file", path: target };
      }
    }

    const fullPath = join(this.rootPath, target);
    if (existsSync(fullPath)) {
      const stat = statSync(fullPath);
      return stat.isDirectory()
        ? { type: "directory", path: fullPath }
        : { type: "file", path: fullPath };
    }

    const symbols = this.index.searchSymbols({ pattern: `^${target}$` });
    if (symbols.length > 0) {
      return { type: "symbol", name: target };
    }

    const partialSymbols = this.index.searchSymbols({ pattern: target });
    if (partialSymbols.length > 0) {
      return { type: "symbol", name: partialSymbols[0].name };
    }

    return { type: "unknown" };
  }

  private async getFileInsight(
    filePath: string,
    opts: Required<InsightOptions>
  ): Promise<Result<FileInsight, string>> {
    const relativePath = relative(this.rootPath, filePath);

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

    const importedBy = this.findImportersOf(relativePath);
    const importsFrom = imports
      .map((imp) => imp.source)
      .filter((s) => s.startsWith("."));

    const recentChanges = getRecentChangesForFile(
      this.rootPath,
      filePath,
      opts.maxChanges
    );

    const lines = sourceResult.value.split("\n").length;
    const complexity =
      lines > 500 || symbols.length > 30
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

    const summary = generateFileSummary(tree.language, symbols, exports);
    const notes = collectFileNotes(metrics);

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

  private async getDirectoryInsight(
    dirPath: string,
    opts: Required<InsightOptions>
  ): Promise<Result<DirectoryInsight, string>> {
    const relativePath = relative(this.rootPath, dirPath);

    const entries = readdirSync(dirPath, { withFileTypes: true });
    const subdirectories = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith(".") &&
          e.name !== "node_modules" &&
          e.name !== "dist"
      )
      .map((e) => e.name);

    const allFiles = this.collectFilesRecursively(dirPath);
    const sourceFiles = allFiles.filter(
      (f) =>
        !f.relativePath.includes("test/") &&
        !f.relativePath.endsWith(".test.ts") &&
        !f.relativePath.endsWith(".spec.ts")
    );
    const testFiles = allFiles.filter(
      (f) =>
        f.relativePath.includes("test/") ||
        f.relativePath.endsWith(".test.ts") ||
        f.relativePath.endsWith(".spec.ts")
    );
    const fileNames = allFiles.map((f) => f.relativePath);

    const entryPointNames = ["index.ts", "index.js", "mod.ts", "main.ts"];
    const entryPoints: string[] = [];

    for (const name of entryPointNames) {
      if (entries.some((e) => e.isFile() && e.name === name)) {
        entryPoints.push(name);
      }
    }

    if (subdirectories.includes("src")) {
      const srcPath = join(dirPath, "src");
      try {
        const srcEntries = readdirSync(srcPath, { withFileTypes: true });
        for (const name of entryPointNames) {
          if (srcEntries.some((e) => e.isFile() && e.name === name)) {
            entryPoints.push(`src/${name}`);
          }
        }
      } catch {
        /* ignore */
      }
    }

    const keySymbols: SymbolRef[] = [];
    const allImports: Set<string> = new Set();
    const internalDeps: Set<string> = new Set();
    let totalLines = 0;
    let totalSymbols = 0;

    for (const file of sourceFiles) {
      const sourceResult = this.fs.read(file.absolutePath);
      if (!sourceResult.ok) continue;

      const parseResult = await this.parser.parse(
        sourceResult.value,
        file.absolutePath
      );
      if (!parseResult.ok) continue;

      const tree = parseResult.value.tree;
      const symbols = flattenSymbols(tree);
      totalLines += sourceResult.value.split("\n").length;
      totalSymbols += symbols.length;

      const exportsResult = await this.syntax.getExports(file.absolutePath);
      if (exportsResult.ok) {
        for (const exp of exportsResult.value) {
          for (const binding of exp.bindings) {
            const sym = symbols.find(
              ({ symbol }) => symbol.name === binding.name
            );
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

      const importsResult = await this.syntax.getImports(file.absolutePath);
      if (importsResult.ok) {
        for (const imp of importsResult.value) {
          if (!imp.source.startsWith(".")) {
            allImports.add(imp.source);
          } else {
            const resolved = this.resolveImportPath(
              dirname(file.absolutePath),
              imp.source
            );
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

    const dependents = this.findDependentsOf(relativePath);

    const recentChanges = getRecentChangesForDirectory(
      this.rootPath,
      dirPath,
      opts.maxChanges
    );

    const complexity =
      totalLines > 1000 ? "high" : totalLines > 300 ? "medium" : "low";
    const metrics: ComplexityMetrics = {
      lines: totalLines,
      symbols: totalSymbols,
      imports: allImports.size,
      exports: keySymbols.length,
      complexity,
    };

    const summary = generateDirectorySummary(
      relativePath,
      sourceFiles.length,
      keySymbols
    );

    const notes: string[] = [];
    if (entryPoints.length === 0 && sourceFiles.length > 0) {
      notes.push("No index/entry point file found");
    }
    if (metrics.complexity === "high") {
      notes.push("High complexity - consider refactoring");
    }
    const nestedSourceCount = sourceFiles.filter((f) =>
      f.relativePath.includes("/")
    ).length;
    if (subdirectories.length > 0 && nestedSourceCount > 0) {
      notes.push(
        `Includes ${subdirectories.length} subdirectories with ${nestedSourceCount} nested source files`
      );
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
        keySymbols: keySymbols.slice(0, 20),
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

  private async getSymbolInsight(
    symbolName: string,
    opts: Required<InsightOptions>
  ): Promise<Result<SymbolInsight, string>> {
    const symbols = this.index.searchSymbols({ pattern: `^${symbolName}$` });
    if (symbols.length === 0) {
      const partial = this.index.searchSymbols({ pattern: symbolName });
      if (partial.length > 0) {
        const suggestions = partial
          .slice(0, 5)
          .map((s) => `  - ${s.name} (${s.kind}) in ${s.filePath}`)
          .join("\n");
        return Err(
          `Symbol "${symbolName}" not found exactly, but found similar:\n${suggestions}\n\nTry one of these names or use the file path.`
        );
      }
      return Err(
        `Symbol not found: "${symbolName}". The symbol may not be exported, or the file hasn't been indexed. Try using a file path instead.`
      );
    }

    if (symbols.length > 1) {
      const matches = symbols
        .map((s) => `- ${s.name} (${s.kind}) in ${s.filePath}:${s.line}`)
        .join("\n");
      return Err(
        `Multiple symbols named "${symbolName}" found. Be more specific:\n${matches}\n\nTry using the file path instead, e.g., insight({ target: "${symbols[0].filePath}" })`
      );
    }

    const symbol = symbols[0];
    const filePath = join(this.rootPath, symbol.filePath);

    const readResult = await this.syntax.readSymbol({
      filePath,
      namePath: symbol.namePath,
      context: 0,
    });
    if (!readResult.ok) {
      return Err(readResult.error);
    }

    const code = readResult.value.body;

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

    const related = this.findRelatedSymbols(symbol);

    const recentChanges = getRecentChangesForSymbol(
      this.rootPath,
      filePath,
      symbol.line,
      opts.maxChanges
    );

    const summary = generateSymbolSummary(symbol, code);
    const signature = extractSignature(code, symbol.kind);
    const notes = collectSymbolNotes(symbol, calls, calledBy);

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

  // Helper methods

  private isSourceFile(name: string): boolean {
    return /\.(ts|tsx|js|jsx|py|go|rs)$/.test(name);
  }

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

  private resolveImportPath(
    fromDir: string,
    importSource: string
  ): string | null {
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
}

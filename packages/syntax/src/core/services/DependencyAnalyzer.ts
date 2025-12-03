/**
 * Dependency Analyzer - Analyze dependencies and detect circular imports.
 */

import path from "path";

import { Err, Ok, Result } from "@agent-workbench/core";

import type { CircularDependency, DependencyAnalysis, ImportInfo } from "../model.js";
import type { FileSystem } from "../ports/FileSystem.js";
import type { Parser } from "../ports/Parser.js";
import type { SymbolTree } from "../symbolTree.js";

export interface DependencyAnalyzerContext {
  indexedFiles: Map<string, SymbolTree>;
  fs: FileSystem;
  parser: Parser;
  resolvePath: (relativePath: string) => string;
}

/**
 * Resolve an import specifier to a file path relative to project root.
 */
function resolveImportPath(
  ctx: DependencyAnalyzerContext,
  fromFile: string,
  importSource: string
): string | null {
  if (!importSource.startsWith(".")) {
    return null; // External package
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, importSource));

  // Try common extensions if no extension present
  if (!path.extname(resolved)) {
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
    for (const ext of extensions) {
      if (ctx.indexedFiles.has(resolved + ext)) {
        return resolved + ext;
      }
    }
    // Try index files
    for (const ext of extensions) {
      const indexPath = path.join(resolved, "index" + ext);
      if (ctx.indexedFiles.has(indexPath)) {
        return indexPath;
      }
    }
  }

  // Remove .js extension and try .ts (common in ESM projects)
  if (resolved.endsWith(".js")) {
    const tsPath = resolved.slice(0, -3) + ".ts";
    if (ctx.indexedFiles.has(tsPath)) {
      return tsPath;
    }
  }

  return ctx.indexedFiles.has(resolved) ? resolved : null;
}

/**
 * Detect circular dependencies using DFS.
 */
function detectCircularDependencies(
  graph: Map<string, { deps: Set<string>; imports: ImportInfo[] }>
): CircularDependency[] {
  const circularDependencies: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const pathStack: string[] = [];

  const detectCycle = (file: string): void => {
    visited.add(file);
    recursionStack.add(file);
    pathStack.push(file);

    const entry = graph.get(file);
    if (entry) {
      for (const dep of entry.deps) {
        if (!visited.has(dep)) {
          detectCycle(dep);
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = pathStack.indexOf(dep);
          const cycle = pathStack.slice(cycleStart);
          cycle.push(dep);

          const fromFile = pathStack[pathStack.length - 1];
          const fromEntry = graph.get(fromFile);
          const closingImport = fromEntry?.imports.find((i) => {
            // Check if this import resolves to the dep
            // This is a simplified check
            return i.source.includes(path.basename(dep, path.extname(dep)));
          });

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

    pathStack.pop();
    recursionStack.delete(file);
  };

  for (const [file] of graph) {
    if (!visited.has(file)) {
      detectCycle(file);
    }
  }

  return circularDependencies;
}

/**
 * Analyze dependencies across all indexed files.
 */
export async function analyzeDependencies(
  ctx: DependencyAnalyzerContext
): Promise<Result<DependencyAnalysis, string>> {
  if (ctx.indexedFiles.size === 0) {
    return Err("No project indexed. Call index first.");
  }

  // Build dependency graph
  const graph = new Map<string, { deps: Set<string>; imports: ImportInfo[] }>();
  const dependents = new Map<string, Set<string>>();
  let totalImports = 0;

  // Initialize all indexed files
  for (const [relativePath] of ctx.indexedFiles) {
    graph.set(relativePath, { deps: new Set(), imports: [] });
    dependents.set(relativePath, new Set());
  }

  // Extract imports from each file
  for (const [relativePath] of ctx.indexedFiles) {
    const fullPath = ctx.resolvePath(relativePath);
    const sourceResult = ctx.fs.read(fullPath);
    if (!sourceResult.ok) continue;

    const importsResult = await ctx.parser.extractImports(sourceResult.value, fullPath);
    if (!importsResult.ok) continue;

    const imports = importsResult.value;
    totalImports += imports.length;

    const entry = graph.get(relativePath)!;
    entry.imports = imports;

    for (const imp of imports) {
      const resolved = resolveImportPath(ctx, relativePath, imp.source);
      if (resolved && graph.has(resolved)) {
        entry.deps.add(resolved);
        dependents.get(resolved)?.add(relativePath);
      }
    }
  }

  // Find circular dependencies
  const circularDependencies = detectCircularDependencies(graph);

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
    totalFiles: ctx.indexedFiles.size,
    totalImports,
    highestDependencyCount: depCounts.slice(0, 10),
    mostImported: importedCounts.slice(0, 10),
    circularDependencies,
    hasCircularDependencies: circularDependencies.length > 0,
  });
}

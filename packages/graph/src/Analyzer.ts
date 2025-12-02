/**
 * Tree-sitter based code analyzer.
 * Uses @agent-workbench/syntax for parsing.
 * Extracts symbols and relationships for the graph.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  TreeSitterParser,
  Symbol as SyntaxSymbol,
  SymbolKind as SyntaxSymbolKind,
} from "@agent-workbench/syntax";
import { isOk } from "@agent-workbench/core";
import type { Node, Edge, SymbolKind } from "./model.js";

// File patterns to include
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
]);

// Directories to skip
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "__pycache__",
  "target",
  "vendor",
]);

/**
 * Maps syntax SymbolKind to our simplified SymbolKind.
 */
function mapKind(kind: SyntaxSymbolKind): SymbolKind {
  const map: Record<SyntaxSymbolKind, SymbolKind> = {
    file: "module",
    class: "class",
    interface: "interface",
    function: "function",
    method: "method",
    property: "variable",
    variable: "variable",
    constant: "constant",
    enum: "enum",
    enum_member: "constant",
    type_alias: "type",
    namespace: "module",
    module: "module",
    constructor: "method",
    field: "variable",
    parameter: "variable",
    import: "module",
  };
  return map[kind];
}

export class Analyzer {
  private parser: TreeSitterParser;

  constructor() {
    this.parser = new TreeSitterParser();
  }

  /**
   * Make node ID from file and name.
   */
  private makeNodeId(file: string, qualifiedName: string): string {
    return `${file}:${qualifiedName}`;
  }

  /**
   * Check if file is supported.
   */
  supportsFile(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf("."));
    return SOURCE_EXTENSIONS.has(ext);
  }

  /**
   * Find all source files in a directory.
   */
  findSourceFiles(rootPath: string): string[] {
    const files: string[] = [];

    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;

        const fullPath = join(dir, entry);
        let stat;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && this.supportsFile(fullPath)) {
          files.push(fullPath);
        }
      }
    };

    walk(rootPath);
    return files;
  }

  /**
   * Analyze a single file.
   */
  async analyzeFile(
    filePath: string,
    rootPath?: string
  ): Promise<{ nodes: Node[]; edges: Edge[] }> {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      return { nodes: [], edges: [] };
    }

    // Parse with tree-sitter
    const parseResult = await this.parser.parse(content, filePath);
    if (!isOk(parseResult)) {
      return { nodes: [], edges: [] };
    }

    // Extract calls
    const callsResult = await this.parser.extractCalls(content, filePath);
    const calls = isOk(callsResult) ? callsResult.value : [];

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const symbols = parseResult.value.tree.symbols;

    // Use relative path if rootPath provided
    const displayPath = rootPath ? relative(rootPath, filePath) : filePath;

    // Process symbols
    this.processSymbols(symbols, displayPath, content, nodes, edges, calls);

    return { nodes, edges };
  }

  /**
   * Process symbols recursively.
   */
  private processSymbols(
    symbols: SyntaxSymbol[],
    file: string,
    content: string,
    nodes: Node[],
    edges: Edge[],
    calls: Array<{ callee: string; line: number; column: number }>,
    parentName?: string
  ): void {
    for (const symbol of symbols) {
      // Skip imports
      if (symbol.kind === "import") continue;

      // Build qualified name
      const qualifiedName = parentName ? `${parentName}.${symbol.name}` : symbol.name;
      const nodeId = this.makeNodeId(file, qualifiedName);

      // Extract source
      const source = content.slice(symbol.span.start.offset, symbol.span.end.offset);

      // Detect async/exported
      const isAsync = /\basync\b/.test(source.slice(0, 100));
      const isExported = /^export\s/.test(source);

      const node: Node = {
        id: nodeId,
        name: symbol.name,
        qualifiedName,
        kind: mapKind(symbol.kind),
        file,
        line: symbol.span.start.line,
        column: symbol.span.start.column,
        source,
        isExported,
        isAsync,
      };

      nodes.push(node);

      // Extract call edges for functions/methods
      if (["function", "method", "constructor"].includes(symbol.kind)) {
        const symbolCalls = calls.filter(
          (call) =>
            call.line >= symbol.span.start.line && call.line <= symbol.span.end.line
        );

        for (const call of symbolCalls) {
          if (call.callee === symbol.name) continue; // Skip self-calls

          edges.push({
            from: nodeId,
            to: call.callee, // Will be resolved later
            kind: "calls",
            file,
            line: call.line,
          });
        }
      }

      // Process children: add contains edges and recurse
      if (symbol.children.length > 0) {
        for (const child of symbol.children) {
          if (child.kind === "import") continue;
          const childQualified = `${qualifiedName}.${child.name}`;
          edges.push({
            from: nodeId,
            to: this.makeNodeId(file, childQualified),
            kind: "contains",
            file,
            line: child.span.start.line,
          });
        }

        // Recurse into children
        this.processSymbols(symbol.children, file, content, nodes, edges, calls, qualifiedName);
      }
    }
  }

  /**
   * Analyze entire workspace.
   */
  async analyzeWorkspace(
    rootPath: string,
    onProgress?: (file: string, current: number, total: number) => void
  ): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const files = this.findSourceFiles(rootPath);
    const allNodes: Node[] = [];
    const allEdges: Edge[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(file, i + 1, files.length);

      const { nodes, edges } = await this.analyzeFile(file, rootPath);
      allNodes.push(...nodes);
      allEdges.push(...edges);
    }

    // Resolve edge targets
    this.resolveEdges(allNodes, allEdges);

    return { nodes: allNodes, edges: allEdges };
  }

  /**
   * Resolve edge targets from symbol names to node IDs.
   */
  private resolveEdges(nodes: Node[], edges: Edge[]): void {
    // Build name -> node ID map
    const nameToId = new Map<string, string>();
    for (const node of nodes) {
      // Map by name
      if (!nameToId.has(node.name)) {
        nameToId.set(node.name, node.id);
      }
      // Map by qualified name
      nameToId.set(node.qualifiedName, node.id);
    }

    // Resolve edge targets
    for (const edge of edges) {
      if (edge.kind === "calls" && !edge.to.includes(":")) {
        // Unresolved - try to find target
        const targetId = nameToId.get(edge.to);
        if (targetId) {
          edge.to = targetId;
        }
        // If not found, leave as symbol name (external or unresolved)
      }
    }
  }
}

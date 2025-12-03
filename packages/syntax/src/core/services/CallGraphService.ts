import { type Result, Ok, Err } from "@agent-workbench/core";
import { FileSystem } from "../ports/FileSystem.js";
import { SymbolTree, flattenSymbols } from "../symbolTree.js";
import {
  CallEdge,
  GraphNode,
  TraceResult,
  GraphPath,
  FindPathsResult,
  DeadCodeItem,
  DeadCodeResult,
} from "../model.js";

/**
 * Call graph data structure.
 */
export interface CallGraphData {
  nodes: Map<string, GraphNode>;
  outgoing: Map<string, CallEdge[]>; // caller -> edges to callees
  incoming: Map<string, CallEdge[]>; // callee -> edges from callers
}

/**
 * Options for building the call graph.
 */
export interface CallGraphBuildOptions {
  indexedFiles: Map<string, SymbolTree>;
  resolvePath: (relativePath: string) => string;
}

/**
 * Manages call graph analysis for a project.
 * Extracted from ProjectIndex to separate graph analysis concerns.
 */
export class CallGraphService {
  private callGraph: CallGraphData | null = null;

  constructor(private readonly fs: FileSystem) {}

  /**
   * Invalidate the call graph (called when files change).
   */
  invalidate(): void {
    this.callGraph = null;
  }

  /**
   * Check if the call graph has been built.
   */
  isBuilt(): boolean {
    return this.callGraph !== null;
  }

  /**
   * Get the call graph data (for internal use).
   */
  getGraph(): CallGraphData | null {
    return this.callGraph;
  }

  /**
   * Build the call graph from indexed files.
   */
  build(options: CallGraphBuildOptions): void {
    const { indexedFiles, resolvePath } = options;
    const nodes = new Map<string, GraphNode>();
    const outgoing = new Map<string, CallEdge[]>();
    const incoming = new Map<string, CallEdge[]>();
    const seenEdges = new Set<string>(); // For deduplication

    // First pass: collect all symbols as nodes
    for (const [relativePath, tree] of indexedFiles) {
      const flattened = flattenSymbols(tree);

      // Check if file has exports (to mark symbols as exported)
      const fullPath = resolvePath(relativePath);
      const sourceResult = this.fs.read(fullPath);
      const source = sourceResult.ok ? sourceResult.value : "";
      const exportedNames = this.extractExportedNames(source);

      for (const { symbol, namePath } of flattened) {
        // Only include callable symbols (functions, methods) and containers (classes)
        if (!["function", "method", "class"].includes(symbol.kind)) continue;

        const id = `${relativePath}:${namePath}`;
        const isExported = exportedNames.has(symbol.name) || exportedNames.has(namePath);

        nodes.set(id, {
          id,
          name: symbol.name,
          namePath,
          kind: symbol.kind,
          file: relativePath,
          line: symbol.span.start.line,
          isExported,
        });
      }
    }

    // Second pass: find call edges
    for (const [relativePath, tree] of indexedFiles) {
      const fullPath = resolvePath(relativePath);
      const sourceResult = this.fs.read(fullPath);
      if (!sourceResult.ok) continue;

      const source = sourceResult.value;
      const lines = source.split("\n");
      const flattened = flattenSymbols(tree);

      // For each callable symbol in this file
      for (const { symbol, namePath } of flattened) {
        if (!["function", "method"].includes(symbol.kind)) continue;

        const callerId = `${relativePath}:${namePath}`;
        const startLine = symbol.span.start.line;
        const endLine = symbol.span.end.line;
        const body = lines.slice(startLine - 1, endLine).join("\n");

        // Find all potential function calls in the body
        const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
        let match: RegExpExecArray | null;

        while ((match = callPattern.exec(body)) !== null) {
          const calleeName = match[1];

          // Skip common keywords that aren't function calls
          if (["if", "for", "while", "switch", "catch", "function", "return", "typeof", "new"].includes(calleeName)) {
            continue;
          }

          // Calculate line number
          const beforeMatch = body.slice(0, match.index);
          const lineOffset = (beforeMatch.match(/\n/g) || []).length;
          const callLine = startLine + lineOffset;

          // Find the callee node - first check same file, then all files
          let calleeId: string | null = null;

          // Check same file first
          for (const [nId] of nodes) {
            if (nId.startsWith(relativePath + ":")) {
              const node = nodes.get(nId)!;
              if (node.name === calleeName || node.namePath.endsWith("." + calleeName)) {
                calleeId = nId;
                break;
              }
            }
          }

          // If not found in same file, search all nodes
          if (!calleeId) {
            for (const [nId, node] of nodes) {
              if (node.name === calleeName) {
                calleeId = nId;
                break;
              }
            }
          }

          if (calleeId && calleeId !== callerId) {
            // Deduplicate edges (same caller -> callee pair)
            const edgeKey = `${callerId}|${calleeId}`;
            if (!seenEdges.has(edgeKey)) {
              seenEdges.add(edgeKey);

              const edge: CallEdge = {
                from: callerId,
                to: calleeId,
                line: callLine,
              };

              if (!outgoing.has(callerId)) outgoing.set(callerId, []);
              outgoing.get(callerId)!.push(edge);

              if (!incoming.has(calleeId)) incoming.set(calleeId, []);
              incoming.get(calleeId)!.push(edge);
            }
          }
        }
      }
    }

    this.callGraph = { nodes, outgoing, incoming };
  }

  /**
   * Extract exported symbol names from source code.
   */
  private extractExportedNames(source: string): Set<string> {
    const exported = new Set<string>();

    const patterns = [
      /export\s+(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /export\s+class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /export\s+const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /export\s+\{([^}]+)\}/g,
      /export\s+default\s+(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const names = match[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim());
        for (const name of names) {
          if (name && !name.includes("{") && !name.includes("}")) {
            exported.add(name);
          }
        }
      }
    }

    return exported;
  }

  /**
   * Trace call chains forward (callees) or backward (callers) from a symbol.
   */
  trace(
    symbolName: string,
    direction: "forward" | "backward",
    maxDepth: number = 5
  ): Result<TraceResult, string> {
    if (!this.callGraph) {
      return Err("Call graph not built. Call build() first.");
    }

    const { nodes, outgoing, incoming } = this.callGraph;

    // Find the starting node
    let startId: string | null = null;
    for (const [id, node] of nodes) {
      if (node.name === symbolName || node.namePath === symbolName || id.endsWith(":" + symbolName)) {
        startId = id;
        break;
      }
    }

    if (!startId) {
      return Err(`Symbol not found: ${symbolName}`);
    }

    // BFS traversal
    const visited = new Set<string>();
    const reachable: Array<{ node: GraphNode; depth: number }> = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const node = nodes.get(id);
      if (node && id !== startId) {
        reachable.push({ node, depth });
      }

      // Get neighbors
      const edges = direction === "forward"
        ? outgoing.get(id) || []
        : incoming.get(id) || [];

      for (const edge of edges) {
        const nextId = direction === "forward" ? edge.to : edge.from;
        if (!visited.has(nextId)) {
          queue.push({ id: nextId, depth: depth + 1 });
        }
      }
    }

    // Sort by depth, then by name
    reachable.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.node.name.localeCompare(b.node.name);
    });

    return Ok({
      from: startId,
      direction,
      depth: maxDepth,
      reachable,
    });
  }

  /**
   * Find all paths between two symbols in the call graph.
   */
  findPaths(
    fromSymbol: string,
    toSymbol: string,
    maxDepth: number = 10
  ): Result<FindPathsResult, string> {
    if (!this.callGraph) {
      return Err("Call graph not built. Call build() first.");
    }

    const { nodes, outgoing } = this.callGraph;

    // Find start and end nodes
    let startId: string | null = null;
    let endId: string | null = null;

    for (const [id, node] of nodes) {
      if (!startId && (node.name === fromSymbol || node.namePath === fromSymbol || id.endsWith(":" + fromSymbol))) {
        startId = id;
      }
      if (!endId && (node.name === toSymbol || node.namePath === toSymbol || id.endsWith(":" + toSymbol))) {
        endId = id;
      }
      if (startId && endId) break;
    }

    if (!startId) {
      return Err(`Source symbol not found: ${fromSymbol}`);
    }
    if (!endId) {
      return Err(`Target symbol not found: ${toSymbol}`);
    }

    // BFS to find all paths
    const paths: GraphPath[] = [];
    const queue: Array<{ path: string[]; visited: Set<string> }> = [
      { path: [startId], visited: new Set([startId]) },
    ];

    while (queue.length > 0 && paths.length < 100) {
      const { path: currentPath, visited } = queue.shift()!;
      const current = currentPath[currentPath.length - 1];

      if (currentPath.length > maxDepth) continue;

      if (current === endId) {
        paths.push({ nodes: currentPath, length: currentPath.length - 1 });
        continue;
      }

      const edges = outgoing.get(current) || [];
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          const newVisited = new Set(visited);
          newVisited.add(edge.to);
          queue.push({ path: [...currentPath, edge.to], visited: newVisited });
        }
      }
    }

    // Sort by length (shortest first)
    paths.sort((a, b) => a.length - b.length);

    return Ok({
      from: startId,
      to: endId,
      paths,
    });
  }

  /**
   * Find potentially dead code - functions/methods not reachable from exports.
   */
  findDeadCode(filePattern?: string): Result<DeadCodeResult, string> {
    if (!this.callGraph) {
      return Err("Call graph not built. Call build() first.");
    }

    const { nodes, outgoing, incoming } = this.callGraph;

    // Filter nodes by pattern if provided
    let nodesToAnalyze: GraphNode[] = Array.from(nodes.values());
    if (filePattern) {
      const regex = new RegExp(filePattern);
      nodesToAnalyze = nodesToAnalyze.filter((n) => regex.test(n.file));
    }

    // Exclude test files
    nodesToAnalyze = nodesToAnalyze.filter(
      (n) =>
        !n.file.includes(".test.") &&
        !n.file.includes(".spec.") &&
        !n.file.includes("__tests__")
    );

    // Find entry points (exported symbols + classes)
    const entryPoints = new Set<string>();
    for (const node of nodesToAnalyze) {
      if (node.isExported || node.kind === "class") {
        entryPoints.add(node.id);
      }
    }

    // Trace all reachable nodes from entry points
    const reachable = new Set<string>();

    const visit = (nodeId: string, visited: Set<string>) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      reachable.add(nodeId);

      const edges = outgoing.get(nodeId) || [];
      for (const edge of edges) {
        visit(edge.to, visited);
      }
    };

    for (const entryId of entryPoints) {
      visit(entryId, new Set());
    }

    // Find unreachable functions/methods
    const deadCode: DeadCodeItem[] = [];

    for (const node of nodesToAnalyze) {
      // Only check functions and methods
      if (!["function", "method"].includes(node.kind)) continue;

      // Skip if reachable
      if (reachable.has(node.id)) continue;

      // Skip private members (underscore prefix)
      if (node.name.startsWith("_") || node.name.startsWith("#")) continue;

      // Determine reason
      const incomingEdges = incoming.get(node.id) || [];
      let reason: string;

      if (incomingEdges.length === 0) {
        if (node.isExported) {
          reason = "Exported but never imported or called";
        } else {
          reason = "Never called from anywhere";
        }
      } else {
        // Has callers, but they're also dead
        const callerNames = incomingEdges
          .slice(0, 3)
          .map((e) => {
            const callerNode = nodes.get(e.from);
            return callerNode?.name || e.from;
          });
        const suffix = incomingEdges.length > 3 ? ` and ${incomingEdges.length - 3} more` : "";
        reason = `Only called by other dead code: ${callerNames.join(", ")}${suffix}`;
      }

      deadCode.push({ node, reason });
    }

    // Sort by file, then line
    deadCode.sort((a, b) => {
      if (a.node.file !== b.node.file) return a.node.file.localeCompare(b.node.file);
      return a.node.line - b.node.line;
    });

    return Ok({
      totalSymbols: nodesToAnalyze.length,
      entryPoints: entryPoints.size,
      deadCode,
    });
  }
}

/**
 * In-memory graph storage with query methods.
 * Simple and efficient - no persistence needed.
 */

import type { Node, Edge, Path, GraphStats, SymbolKind, EdgeKind } from "./model.js";

export class GraphStore {
  private nodes = new Map<string, Node>();
  private outgoing = new Map<string, Edge[]>(); // from -> edges
  private incoming = new Map<string, Edge[]>(); // to -> edges
  private fileNodes = new Map<string, Set<string>>(); // file -> node IDs

  /**
   * Add nodes and edges to the graph.
   */
  add(nodes: Node[], edges: Edge[]): void {
    for (const node of nodes) {
      this.nodes.set(node.id, node);

      // Track by file
      if (!this.fileNodes.has(node.file)) {
        this.fileNodes.set(node.file, new Set());
      }
      this.fileNodes.get(node.file)!.add(node.id);
    }

    for (const edge of edges) {
      // Outgoing edges
      if (!this.outgoing.has(edge.from)) {
        this.outgoing.set(edge.from, []);
      }
      this.outgoing.get(edge.from)!.push(edge);

      // Incoming edges
      if (!this.incoming.has(edge.to)) {
        this.incoming.set(edge.to, []);
      }
      this.incoming.get(edge.to)!.push(edge);
    }
  }

  /**
   * Clear the entire graph.
   */
  clear(): void {
    this.nodes.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.fileNodes.clear();
  }

  /**
   * Remove all nodes and edges from a specific file.
   */
  removeFile(file: string): void {
    const nodeIds = this.fileNodes.get(file);
    if (!nodeIds) return;

    for (const id of nodeIds) {
      this.nodes.delete(id);

      // Remove outgoing edges
      this.outgoing.delete(id);

      // Remove from incoming edges
      for (const [targetId, edges] of this.incoming.entries()) {
        const filtered = edges.filter((e) => e.from !== id);
        if (filtered.length === 0) {
          this.incoming.delete(targetId);
        } else {
          this.incoming.set(targetId, filtered);
        }
      }
    }

    this.fileNodes.delete(file);
  }

  /**
   * Get a node by ID.
   */
  getNode(id: string): Node | null {
    return this.nodes.get(id) ?? null;
  }

  /**
   * Get all nodes.
   */
  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get callers of a symbol (who calls this?).
   */
  getCallers(id: string, edgeKinds?: EdgeKind[]): Node[] {
    const edges = this.incoming.get(id) ?? [];
    const filtered = edgeKinds
      ? edges.filter((e) => edgeKinds.includes(e.kind))
      : edges.filter((e) => e.kind === "calls");

    const nodes: Node[] = [];
    for (const edge of filtered) {
      const node = this.nodes.get(edge.from);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Get callees of a symbol (what does this call?).
   */
  getCallees(id: string, edgeKinds?: EdgeKind[]): Node[] {
    const edges = this.outgoing.get(id) ?? [];
    const filtered = edgeKinds
      ? edges.filter((e) => edgeKinds.includes(e.kind))
      : edges.filter((e) => e.kind === "calls");

    const nodes: Node[] = [];
    for (const edge of filtered) {
      const node = this.nodes.get(edge.to);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Trace from a symbol in a direction up to maxDepth.
   * Returns all reachable nodes.
   */
  trace(
    id: string,
    direction: "forward" | "backward",
    maxDepth: number = 5,
    edgeKinds?: EdgeKind[]
  ): Node[] {
    const visited = new Set<string>();
    const result: Node[] = [];

    const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];

    while (queue.length > 0) {
      const { id: currentId, depth } = queue.shift()!;

      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (node && currentId !== id) {
        result.push(node);
      }

      // Get neighbors
      const edges =
        direction === "forward"
          ? this.outgoing.get(currentId) ?? []
          : this.incoming.get(currentId) ?? [];

      const filtered = edgeKinds ? edges.filter((e) => edgeKinds.includes(e.kind)) : edges;

      for (const edge of filtered) {
        const nextId = direction === "forward" ? edge.to : edge.from;
        if (!visited.has(nextId)) {
          queue.push({ id: nextId, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Find all paths between two symbols.
   * Uses BFS to find shortest paths first.
   */
  findPaths(from: string, to: string, maxDepth: number = 10): Path[] {
    const paths: Path[] = [];
    const queue: Array<{ path: string[]; visited: Set<string> }> = [
      { path: [from], visited: new Set([from]) },
    ];

    while (queue.length > 0 && paths.length < 100) {
      const { path, visited } = queue.shift()!;
      const current = path[path.length - 1];

      if (path.length > maxDepth) continue;

      if (current === to) {
        paths.push({ nodes: path, length: path.length - 1 });
        continue;
      }

      const edges = this.outgoing.get(current) ?? [];
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          const newVisited = new Set(visited);
          newVisited.add(edge.to);
          queue.push({ path: [...path, edge.to], visited: newVisited });
        }
      }
    }

    // Sort by length (shortest first)
    return paths.sort((a, b) => a.length - b.length);
  }

  /**
   * Find symbols matching a pattern.
   */
  findSymbols(pattern: RegExp, kinds?: SymbolKind[], limit: number = 100): Node[] {
    const results: Node[] = [];

    for (const node of this.nodes.values()) {
      if (results.length >= limit) break;

      // Filter by kind
      if (kinds && !kinds.includes(node.kind)) continue;

      // Match pattern against name or qualifiedName
      if (pattern.test(node.name) || pattern.test(node.qualifiedName)) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Get graph statistics.
   */
  stats(): GraphStats {
    let edgeCount = 0;
    for (const edges of this.outgoing.values()) {
      edgeCount += edges.length;
    }

    return {
      nodes: this.nodes.size,
      edges: edgeCount,
      files: this.fileNodes.size,
    };
  }

  /**
   * Check if the graph has any data.
   */
  isEmpty(): boolean {
    return this.nodes.size === 0;
  }
}

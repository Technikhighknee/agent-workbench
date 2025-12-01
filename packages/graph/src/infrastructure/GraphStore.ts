/**
 * In-memory graph store with indexed lookups.
 * Optimized for fast queries - O(1) lookups, efficient traversal.
 */

import { GraphNode, GraphEdge, SymbolKind, EdgeKind } from "../core/model.js";

export class GraphStore {
  // Primary storage
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();

  // Node indexes
  private nodesByName: Map<string, Set<string>> = new Map();
  private nodesByFile: Map<string, Set<string>> = new Map();
  private nodesByKind: Map<SymbolKind, Set<string>> = new Map();
  private nodesByTag: Map<string, Set<string>> = new Map();
  private nodesByQualifiedName: Map<string, string> = new Map();

  // Edge indexes for fast traversal
  private outgoingEdges: Map<string, Set<string>> = new Map();  // nodeId -> edgeIds
  private incomingEdges: Map<string, Set<string>> = new Map();  // nodeId -> edgeIds
  private edgesByKind: Map<EdgeKind, Set<string>> = new Map();

  // File tracking for incremental updates
  private fileHashes: Map<string, string> = new Map();

  // --- Node Operations ---

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);

    // Index by name
    if (!this.nodesByName.has(node.name)) {
      this.nodesByName.set(node.name, new Set());
    }
    this.nodesByName.get(node.name)!.add(node.id);

    // Index by file
    if (!this.nodesByFile.has(node.file)) {
      this.nodesByFile.set(node.file, new Set());
    }
    this.nodesByFile.get(node.file)!.add(node.id);

    // Index by kind
    if (!this.nodesByKind.has(node.kind)) {
      this.nodesByKind.set(node.kind, new Set());
    }
    this.nodesByKind.get(node.kind)!.add(node.id);

    // Index by tags
    for (const tag of node.tags) {
      if (!this.nodesByTag.has(tag)) {
        this.nodesByTag.set(tag, new Set());
      }
      this.nodesByTag.get(tag)!.add(node.id);
    }

    // Index by qualified name
    this.nodesByQualifiedName.set(node.qualifiedName, node.id);

    // Initialize edge sets
    if (!this.outgoingEdges.has(node.id)) {
      this.outgoingEdges.set(node.id, new Set());
    }
    if (!this.incomingEdges.has(node.id)) {
      this.incomingEdges.set(node.id, new Set());
    }
  }

  getNode(id: string): GraphNode | null {
    return this.nodes.get(id) ?? null;
  }

  getNodeByQualifiedName(qualifiedName: string): GraphNode | null {
    const id = this.nodesByQualifiedName.get(qualifiedName);
    return id ? this.nodes.get(id) ?? null : null;
  }

  findNodesByName(name: string): GraphNode[] {
    const ids = this.nodesByName.get(name);
    if (!ids) return [];
    return Array.from(ids).map(id => this.nodes.get(id)!);
  }

  findNodesByPattern(pattern: string): GraphNode[] {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"), "i");
    const results: GraphNode[] = [];
    for (const [name, ids] of this.nodesByName) {
      if (regex.test(name)) {
        for (const id of ids) {
          results.push(this.nodes.get(id)!);
        }
      }
    }
    return results;
  }

  findNodesByFile(file: string): GraphNode[] {
    const ids = this.nodesByFile.get(file);
    if (!ids) return [];
    return Array.from(ids).map(id => this.nodes.get(id)!);
  }

  findNodesByKind(kind: SymbolKind): GraphNode[] {
    const ids = this.nodesByKind.get(kind);
    if (!ids) return [];
    return Array.from(ids).map(id => this.nodes.get(id)!);
  }

  findNodesByTag(tag: string): GraphNode[] {
    const ids = this.nodesByTag.get(tag);
    if (!ids) return [];
    return Array.from(ids).map(id => this.nodes.get(id)!);
  }

  findNodesByTags(tags: string[]): GraphNode[] {
    if (tags.length === 0) return [];

    // Get first tag's ids as starting set
    const firstIds = this.nodesByTag.get(tags[0]);
    if (!firstIds) return [];

    let resultIds = Array.from(firstIds);

    // Intersect with remaining tags
    for (let i = 1; i < tags.length; i++) {
      const tagIds = this.nodesByTag.get(tags[i]);
      if (!tagIds) return [];
      resultIds = resultIds.filter(id => tagIds.has(id));
    }

    return resultIds.map(id => this.nodes.get(id)!);
  }

  // --- Edge Operations ---

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);

    // Index for traversal
    if (!this.outgoingEdges.has(edge.source)) {
      this.outgoingEdges.set(edge.source, new Set());
    }
    this.outgoingEdges.get(edge.source)!.add(edge.id);

    if (!this.incomingEdges.has(edge.target)) {
      this.incomingEdges.set(edge.target, new Set());
    }
    this.incomingEdges.get(edge.target)!.add(edge.id);

    // Index by kind
    if (!this.edgesByKind.has(edge.kind)) {
      this.edgesByKind.set(edge.kind, new Set());
    }
    this.edgesByKind.get(edge.kind)!.add(edge.id);
  }

  getEdge(id: string): GraphEdge | null {
    return this.edges.get(id) ?? null;
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    const edgeIds = this.outgoingEdges.get(nodeId);
    if (!edgeIds) return [];
    return Array.from(edgeIds).map(id => this.edges.get(id)!);
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    const edgeIds = this.incomingEdges.get(nodeId);
    if (!edgeIds) return [];
    return Array.from(edgeIds).map(id => this.edges.get(id)!);
  }

  // --- Traversal ---

  getCallees(nodeId: string): GraphNode[] {
    const edges = this.getOutgoingEdges(nodeId).filter(e => e.kind === "calls");
    return edges.map(e => this.nodes.get(e.target)!).filter(Boolean);
  }

  getCallers(nodeId: string): GraphNode[] {
    const edges = this.getIncomingEdges(nodeId).filter(e => e.kind === "calls");
    return edges.map(e => this.nodes.get(e.source)!).filter(Boolean);
  }

  // --- File Management ---

  setFileHash(file: string, hash: string): void {
    this.fileHashes.set(file, hash);
  }

  getFileHash(file: string): string | null {
    return this.fileHashes.get(file) ?? null;
  }

  removeFileNodes(file: string): void {
    const nodeIds = this.nodesByFile.get(file);
    if (!nodeIds) return;

    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      // Remove from indexes
      this.nodesByName.get(node.name)?.delete(nodeId);
      this.nodesByKind.get(node.kind)?.delete(nodeId);
      for (const tag of node.tags) {
        this.nodesByTag.get(tag)?.delete(nodeId);
      }
      this.nodesByQualifiedName.delete(node.qualifiedName);

      // Remove edges
      const outgoing = this.outgoingEdges.get(nodeId);
      if (outgoing) {
        for (const edgeId of outgoing) {
          const edge = this.edges.get(edgeId);
          if (edge) {
            this.incomingEdges.get(edge.target)?.delete(edgeId);
            this.edgesByKind.get(edge.kind)?.delete(edgeId);
            this.edges.delete(edgeId);
          }
        }
      }

      const incoming = this.incomingEdges.get(nodeId);
      if (incoming) {
        for (const edgeId of incoming) {
          const edge = this.edges.get(edgeId);
          if (edge) {
            this.outgoingEdges.get(edge.source)?.delete(edgeId);
            this.edgesByKind.get(edge.kind)?.delete(edgeId);
            this.edges.delete(edgeId);
          }
        }
      }

      this.outgoingEdges.delete(nodeId);
      this.incomingEdges.delete(nodeId);
      this.nodes.delete(nodeId);
    }

    this.nodesByFile.delete(file);
    this.fileHashes.delete(file);
  }

  // --- Stats ---

  getStats(): { nodes: number; edges: number; files: number } {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      files: this.nodesByFile.size,
    };
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.nodesByName.clear();
    this.nodesByFile.clear();
    this.nodesByKind.clear();
    this.nodesByTag.clear();
    this.nodesByQualifiedName.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();
    this.edgesByKind.clear();
    this.fileHashes.clear();
  }
}

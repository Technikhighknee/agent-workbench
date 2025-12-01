/**
 * Query engine for graph traversal and compound queries.
 * Executes queries against the GraphStore.
 */

import { GraphStore } from "./GraphStore.js";
import {
  GraphNode,
  GraphEdge,
  GraphPath,
  QueryOptions,
  QueryResult,
  SymbolKind,
} from "../core/model.js";

export class QueryEngine {
  constructor(private store: GraphStore) {}

  query(options: QueryOptions): QueryResult {
    const startTime = performance.now();
    const visited = new Set<string>();
    const resultNodes = new Map<string, GraphNode>();
    const resultEdges = new Map<string, GraphEdge>();
    const paths: GraphPath[] = [];

    // Resolve starting nodes
    const startNodes = this.resolveStartNodes(options.from);

    if (!options.traverse) {
      // Just return the starting nodes
      for (const node of startNodes) {
        resultNodes.set(node.id, node);
      }
    } else {
      // Traverse from starting nodes
      const { direction, edgeKinds, maxDepth = 5, minConfidence = 0 } = options.traverse;

      for (const startNode of startNodes) {
        if (options.output?.format === "paths" && options.mustReach) {
          // Path finding mode
          const foundPaths = this.findPaths(
            startNode.id,
            options.mustReach,
            options.mustAvoid || [],
            maxDepth,
            minConfidence,
            edgeKinds,
            direction
          );
          paths.push(...foundPaths);

          // Collect nodes and edges from paths
          for (const path of foundPaths) {
            for (const nodeId of path.nodes) {
              const node = this.store.getNode(nodeId);
              if (node) resultNodes.set(nodeId, node);
            }
            for (const edgeId of path.edges) {
              const edge = this.store.getEdge(edgeId);
              if (edge) resultEdges.set(edgeId, edge);
            }
          }
        } else {
          // BFS traversal
          this.bfsTraverse(
            startNode.id,
            direction,
            edgeKinds,
            maxDepth,
            minConfidence,
            options.mustAvoid || [],
            visited,
            resultNodes,
            resultEdges
          );
        }
      }
    }

    // Apply filters
    let filteredNodes = Array.from(resultNodes.values());
    if (options.filter) {
      filteredNodes = this.applyFilters(filteredNodes, options.filter);
    }

    // Apply output options
    const includeSource = options.output?.includeSource ?? true;
    if (!includeSource) {
      filteredNodes = filteredNodes.map(n => ({ ...n, source: "[omitted]" }));
    }

    const limit = options.output?.limit;
    if (limit && filteredNodes.length > limit) {
      filteredNodes = filteredNodes.slice(0, limit);
    }

    const queryMs = performance.now() - startTime;

    return {
      nodes: filteredNodes,
      edges: Array.from(resultEdges.values()),
      paths: paths.length > 0 ? paths : undefined,
      unresolved: [],
      stats: {
        nodesVisited: visited.size,
        nodesReturned: filteredNodes.length,
        pathsFound: paths.length,
        queryMs,
      },
    };
  }

  private resolveStartNodes(from: QueryOptions["from"]): GraphNode[] {
    if (typeof from === "string") {
      // Single symbol name or qualified name
      const byQualified = this.store.getNodeByQualifiedName(from);
      if (byQualified) return [byQualified];

      const byName = this.store.findNodesByName(from);
      if (byName.length > 0) return byName;

      // Try pattern match
      return this.store.findNodesByPattern(from);
    }

    if (Array.isArray(from)) {
      const nodes: GraphNode[] = [];
      for (const name of from) {
        const byQualified = this.store.getNodeByQualifiedName(name);
        if (byQualified) {
          nodes.push(byQualified);
        } else {
          nodes.push(...this.store.findNodesByName(name));
        }
      }
      return nodes;
    }

    // Object with pattern/tags/kinds
    let candidates = this.store.getAllNodes();

    if (from.pattern) {
      const patternNodes = this.store.findNodesByPattern(from.pattern);
      const patternIds = new Set(patternNodes.map(n => n.id));
      candidates = candidates.filter(n => patternIds.has(n.id));
    }

    if (from.tags && from.tags.length > 0) {
      const tagNodes = this.store.findNodesByTags(from.tags);
      const tagIds = new Set(tagNodes.map(n => n.id));
      candidates = candidates.filter(n => tagIds.has(n.id));
    }

    if (from.kinds && from.kinds.length > 0) {
      const kindSet = new Set(from.kinds);
      candidates = candidates.filter(n => kindSet.has(n.kind));
    }

    return candidates;
  }

  private bfsTraverse(
    startId: string,
    direction: "forward" | "backward" | "both",
    edgeKinds: string[] | undefined,
    maxDepth: number,
    minConfidence: number,
    mustAvoid: string[],
    visited: Set<string>,
    resultNodes: Map<string, GraphNode>,
    resultEdges: Map<string, GraphEdge>
  ): void {
    const avoidSet = new Set(mustAvoid);
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: startId, depth: 0 }];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      if (avoidSet.has(nodeId)) continue;
      if (depth > maxDepth) continue;

      visited.add(nodeId);

      const node = this.store.getNode(nodeId);
      if (!node) continue;

      resultNodes.set(nodeId, node);

      // Get edges based on direction
      let edges: GraphEdge[] = [];
      if (direction === "forward" || direction === "both") {
        edges.push(...this.store.getOutgoingEdges(nodeId));
      }
      if (direction === "backward" || direction === "both") {
        edges.push(...this.store.getIncomingEdges(nodeId));
      }

      // Filter by edge kind and confidence
      edges = edges.filter(e => {
        if (edgeKinds && !edgeKinds.includes(e.kind)) return false;
        if (e.confidence < minConfidence) return false;
        return true;
      });

      for (const edge of edges) {
        resultEdges.set(edge.id, edge);

        const nextNodeId = edge.source === nodeId ? edge.target : edge.source;
        if (!visited.has(nextNodeId) && !avoidSet.has(nextNodeId)) {
          queue.push({ nodeId: nextNodeId, depth: depth + 1 });
        }
      }
    }
  }

  private findPaths(
    startId: string,
    mustReach: string[],
    mustAvoid: string[],
    maxDepth: number,
    minConfidence: number,
    edgeKinds: string[] | undefined,
    direction: "forward" | "backward" | "both"
  ): GraphPath[] {
    const paths: GraphPath[] = [];
    const avoidSet = new Set(mustAvoid);
    const reachSet = new Set<string>();

    // Resolve mustReach to node IDs
    for (const target of mustReach) {
      const node = this.store.getNodeByQualifiedName(target);
      if (node) {
        reachSet.add(node.id);
      } else {
        const byName = this.store.findNodesByName(target);
        for (const n of byName) {
          reachSet.add(n.id);
        }
      }
    }

    // DFS to find all paths
    const dfs = (
      currentId: string,
      path: string[],
      edgePath: string[],
      confidence: number,
      visited: Set<string>
    ): void => {
      if (path.length > maxDepth + 1) return;
      if (avoidSet.has(currentId)) return;

      if (reachSet.has(currentId) && path.length > 1) {
        paths.push({
          nodes: [...path],
          edges: [...edgePath],
          confidence,
          length: path.length,
        });
        return;
      }

      // Get edges based on direction
      let edges: GraphEdge[] = [];
      if (direction === "forward" || direction === "both") {
        edges.push(...this.store.getOutgoingEdges(currentId));
      }
      if (direction === "backward" || direction === "both") {
        edges.push(...this.store.getIncomingEdges(currentId));
      }

      edges = edges.filter(e => {
        if (edgeKinds && !edgeKinds.includes(e.kind)) return false;
        if (e.confidence < minConfidence) return false;
        return true;
      });

      for (const edge of edges) {
        const nextId = edge.source === currentId ? edge.target : edge.source;
        if (visited.has(nextId)) continue;

        visited.add(nextId);
        path.push(nextId);
        edgePath.push(edge.id);

        dfs(nextId, path, edgePath, confidence * edge.confidence, visited);

        path.pop();
        edgePath.pop();
        visited.delete(nextId);
      }
    };

    const visited = new Set<string>([startId]);
    dfs(startId, [startId], [], 1.0, visited);

    return paths;
  }

  private applyFilters(
    nodes: GraphNode[],
    filter: NonNullable<QueryOptions["filter"]>
  ): GraphNode[] {
    let result = nodes;

    if (filter.kinds && filter.kinds.length > 0) {
      const kindSet = new Set(filter.kinds);
      result = result.filter(n => kindSet.has(n.kind));
    }

    if (filter.files && filter.files.length > 0) {
      // Simple glob-like matching
      const patterns = filter.files.map(f =>
        new RegExp(f.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))
      );
      result = result.filter(n =>
        patterns.some(p => p.test(n.file))
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      result = result.filter(n =>
        filter.tags!.every(tag => n.tags.includes(tag))
      );
    }

    return result;
  }

  // Convenience methods

  getCallers(symbolName: string): QueryResult {
    return this.query({
      from: symbolName,
      traverse: { direction: "backward", edgeKinds: ["calls"], maxDepth: 1 },
      output: { format: "nodes" },
    });
  }

  getCallees(symbolName: string): QueryResult {
    return this.query({
      from: symbolName,
      traverse: { direction: "forward", edgeKinds: ["calls"], maxDepth: 1 },
      output: { format: "nodes" },
    });
  }

  getCallGraph(symbolName: string, depth: number = 3): QueryResult {
    return this.query({
      from: symbolName,
      traverse: { direction: "both", edgeKinds: ["calls"], maxDepth: depth },
      output: { format: "subgraph" },
    });
  }

  findSymbols(options: {
    pattern?: string;
    tags?: string[];
    kinds?: SymbolKind[];
    limit?: number;
  }): QueryResult {
    return this.query({
      from: {
        pattern: options.pattern,
        tags: options.tags,
        kinds: options.kinds,
      },
      output: { format: "nodes", limit: options.limit },
    });
  }
}

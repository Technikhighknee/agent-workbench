/**
 * Main GraphService - ties together storage, analysis, and queries.
 * Handles workspace indexing and incremental updates.
 */

import { readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import { GraphStore } from "./GraphStore.js";
import { TypeScriptAnalyzer } from "./TypeScriptAnalyzer.js";
import { QueryEngine } from "./QueryEngine.js";
import {
  GraphNode,
  QueryOptions,
  QueryResult,
  SymbolKind,
  Result,
  Ok,
  Err,
} from "../core/model.js";

export interface IndexStats {
  filesIndexed: number;
  nodesCreated: number;
  edgesCreated: number;
  indexTimeMs: number;
}

export class GraphService {
  private store: GraphStore;
  private analyzer: TypeScriptAnalyzer;
  private queryEngine: QueryEngine;
  private workspacePath: string = "";
  private initialized: boolean = false;

  constructor() {
    this.store = new GraphStore();
    this.analyzer = new TypeScriptAnalyzer();
    this.queryEngine = new QueryEngine(this.store);
  }

  async initialize(workspacePath: string): Promise<Result<IndexStats, Error>> {
    try {
      this.workspacePath = workspacePath;
      const stats = await this.indexWorkspace(workspacePath);
      this.initialized = true;
      return Ok(stats);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async indexWorkspace(workspacePath: string): Promise<IndexStats> {
    const startTime = performance.now();
    this.store.clear();
    
    // Create fresh analyzer instance to pick up any code changes
    this.analyzer = new TypeScriptAnalyzer();

    const files = this.findTypeScriptFiles(workspacePath);
    let nodesCreated = 0;
    let edgesCreated = 0;

    for (const file of files) {
      try {
        const { nodes, edges } = this.analyzer.analyze(file);

        for (const node of nodes) {
          // Make paths relative
          node.file = relative(workspacePath, node.file);
          this.store.addNode(node);
          nodesCreated++;
        }

        for (const edge of edges) {
          edge.file = relative(workspacePath, edge.file);
          this.store.addEdge(edge);
          edgesCreated++;
        }

        // Store file hash for incremental updates
        const hash = this.analyzer.computeFileHash(file);
        this.store.setFileHash(relative(workspacePath, file), hash);
      } catch (error) {
        // Skip files that fail to parse
        console.error(`Failed to analyze ${file}:`, error);
      }
    }

    // Resolve edge targets (connect calls to their definitions)
    this.resolveEdgeTargets();

    const indexTimeMs = performance.now() - startTime;

    return {
      filesIndexed: files.length,
      nodesCreated,
      edgesCreated,
      indexTimeMs,
    };
  }

  private findTypeScriptFiles(dir: string, files: string[] = []): string[] {
    if (!existsSync(dir)) return files;

    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      // Skip common non-source directories
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === ".git" ||
        entry === "coverage" ||
        entry === ".next" ||
        entry === "build"
      ) {
        continue;
      }

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          this.findTypeScriptFiles(fullPath, files);
        } else if (
          entry.endsWith(".ts") ||
          entry.endsWith(".tsx") ||
          entry.endsWith(".js") ||
          entry.endsWith(".jsx")
        ) {
          // Skip test files and declaration files for now
          if (!entry.endsWith(".d.ts") && !entry.includes(".test.") && !entry.includes(".spec.")) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip files we can't read
      }
    }

    return files;
  }

  private resolveEdgeTargets(): void {
    // For each call edge, try to resolve the target to an actual node
    const allEdges = this.store.getAllEdges();
    const allNodes = this.store.getAllNodes();

    // Build lookup maps
    const nodesByName = new Map<string, GraphNode[]>();
    const nodesByQualified = new Map<string, GraphNode>();

    for (const node of allNodes) {
      if (!nodesByName.has(node.name)) {
        nodesByName.set(node.name, []);
      }
      nodesByName.get(node.name)!.push(node);
      nodesByQualified.set(node.qualifiedName, node);
    }

    for (const edge of allEdges) {
      if (edge.kind === "calls") {
        const targetName = edge.target;

        // Try qualified name first
        const byQualified = nodesByQualified.get(targetName);
        if (byQualified) {
          edge.target = byQualified.id;
          continue;
        }

        // Try simple name (might be multiple matches)
        const byName = nodesByName.get(targetName);
        if (byName && byName.length === 1) {
          edge.target = byName[0].id;
        } else if (byName && byName.length > 1) {
          // Multiple matches - pick the first, lower confidence
          edge.target = byName[0].id;
          edge.confidence *= 0.7;
        }
        // If no match found, target remains as the name string (unresolved)
      }
    }
  }

  // --- Query API ---

  query(options: QueryOptions): Result<QueryResult, Error> {
    if (!this.initialized) {
      return Err(new Error("GraphService not initialized"));
    }

    try {
      const result = this.queryEngine.query(options);
      return Ok(result);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getSymbol(nameOrId: string): Result<GraphNode, Error> {
    if (!this.initialized) {
      return Err(new Error("GraphService not initialized"));
    }

    const node = this.store.getNode(nameOrId) ||
                 this.store.getNodeByQualifiedName(nameOrId) ||
                 this.store.findNodesByName(nameOrId)[0];

    if (!node) {
      return Err(new Error(`Symbol not found: ${nameOrId}`));
    }

    return Ok(node);
  }

  getCallers(symbol: string): Result<QueryResult, Error> {
    if (!this.initialized) {
      return Err(new Error("GraphService not initialized"));
    }

    try {
      const result = this.queryEngine.getCallers(symbol);
      return Ok(result);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getCallees(symbol: string): Result<QueryResult, Error> {
    if (!this.initialized) {
      return Err(new Error("GraphService not initialized"));
    }

    try {
      const result = this.queryEngine.getCallees(symbol);
      return Ok(result);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  findSymbols(options: {
    pattern?: string;
    tags?: string[];
    kinds?: SymbolKind[];
    limit?: number;
  }): Result<QueryResult, Error> {
    if (!this.initialized) {
      return Err(new Error("GraphService not initialized"));
    }

    try {
      const result = this.queryEngine.findSymbols(options);
      return Ok(result);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  traceForward(
    symbol: string,
    options?: { depth?: number; minConfidence?: number; edgeKinds?: string[] }
  ): Result<QueryResult, Error> {
    return this.query({
      from: symbol,
      traverse: {
        direction: "forward",
        maxDepth: options?.depth ?? 5,
        minConfidence: options?.minConfidence ?? 0,
        edgeKinds: options?.edgeKinds as any,
      },
      output: { format: "subgraph" },
    });
  }

  traceBackward(
    symbol: string,
    options?: { depth?: number; minConfidence?: number; edgeKinds?: string[] }
  ): Result<QueryResult, Error> {
    return this.query({
      from: symbol,
      traverse: {
        direction: "backward",
        maxDepth: options?.depth ?? 5,
        minConfidence: options?.minConfidence ?? 0,
        edgeKinds: options?.edgeKinds as any,
      },
      output: { format: "subgraph" },
    });
  }

  findPaths(
    from: string,
    to: string,
    options?: { maxDepth?: number; mustAvoid?: string[] }
  ): Result<QueryResult, Error> {
    return this.query({
      from,
      traverse: {
        direction: "forward",
        maxDepth: options?.maxDepth ?? 10,
      },
      mustReach: [to],
      mustAvoid: options?.mustAvoid,
      output: { format: "paths" },
    });
  }

  getStats(): { nodes: number; edges: number; files: number } {
    return this.store.getStats();
  }

  // --- Reindex ---

  async reindex(): Promise<Result<IndexStats, Error>> {
    if (!this.workspacePath) {
      return Err(new Error("No workspace path set"));
    }

    return this.initialize(this.workspacePath);
  }
}

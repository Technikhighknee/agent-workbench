/**
 * Main GraphService - ties together storage, analysis, and queries.
 * Handles workspace indexing and incremental updates.
 * Auto-reindexes when files change via file watcher.
 */

import { readdirSync, statSync, existsSync, watch, FSWatcher } from "fs";
import { join, relative, extname } from "path";
import { GraphStore } from "./GraphStore.js";
import { TypeScriptAnalyzer } from "./TypeScriptAnalyzer.js";
import { TreeSitterAnalyzer } from "./TreeSitterAnalyzer.js";
import { QueryEngine } from "./QueryEngine.js";
import {
  GraphNode,
  GraphEdge,
  EdgeKind,
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
  private legacyAnalyzer: TypeScriptAnalyzer;
  private treeSitterAnalyzer: TreeSitterAnalyzer | null = null;
  private queryEngine: QueryEngine;
  private workspacePath: string = "";
  private initialized: boolean = false;
  private useTreeSitter: boolean = true;

  // File watching for auto-reindex
  private watcher: FSWatcher | null = null;
  private reindexPending: boolean = false;
  private reindexDebounceTimer: NodeJS.Timeout | null = null;
  private readonly reindexDebounceMs = 500; // Debounce multiple rapid changes

  constructor(options?: { useTreeSitter?: boolean }) {
    this.store = new GraphStore();
    this.legacyAnalyzer = new TypeScriptAnalyzer();
    this.queryEngine = new QueryEngine(this.store);
    this.useTreeSitter = options?.useTreeSitter ?? true;

    // Initialize tree-sitter analyzer if enabled
    if (this.useTreeSitter) {
      try {
        this.treeSitterAnalyzer = new TreeSitterAnalyzer();
      } catch (error) {
        console.error("[graph] Failed to initialize TreeSitterAnalyzer, using legacy analyzer:", error);
        this.treeSitterAnalyzer = null;
      }
    }
  }

  async initialize(workspacePath: string): Promise<Result<IndexStats, Error>> {
    try {
      // Stop any existing watcher
      this.stopWatcher();

      this.workspacePath = workspacePath;
      const stats = await this.indexWorkspace(workspacePath);
      this.initialized = true;

      // Start watching for file changes
      this.startWatcher();

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

    // Create fresh analyzer instances to pick up any code changes
    this.legacyAnalyzer = new TypeScriptAnalyzer();
    if (this.useTreeSitter) {
      try {
        this.treeSitterAnalyzer = new TreeSitterAnalyzer();
      } catch {
        this.treeSitterAnalyzer = null;
      }
    }

    const files = this.findSourceFiles(workspacePath);
    let nodesCreated = 0;
    let edgesCreated = 0;

    for (const file of files) {
      try {
        let result: { nodes: GraphNode[]; edges: GraphEdge[] };

        // Try tree-sitter first for supported files
        if (this.treeSitterAnalyzer && this.treeSitterAnalyzer.supportsFile(file)) {
          result = await this.treeSitterAnalyzer.analyze(file);
        } else {
          // Fall back to legacy regex analyzer for TS/JS
          result = this.legacyAnalyzer.analyze(file);
        }

        const { nodes, edges } = result;

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
        const hash = this.treeSitterAnalyzer?.computeFileHash(file) ??
          this.legacyAnalyzer.computeFileHash(file);
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

  /**
   * Find all supported source files in a directory.
   * Supports: TypeScript, JavaScript, Python, Go, Rust
   */
  private findSourceFiles(dir: string, files: string[] = []): string[] {
    if (!existsSync(dir)) return files;

    const entries = readdirSync(dir);

    // Supported extensions based on whether tree-sitter is enabled
    const supportedExtensions = this.treeSitterAnalyzer
      ? [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]
      : [".ts", ".tsx", ".js", ".jsx"];

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      // Skip common non-source directories
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === ".git" ||
        entry === "coverage" ||
        entry === ".next" ||
        entry === "build" ||
        entry === "__pycache__" ||
        entry === ".venv" ||
        entry === "venv" ||
        entry === "target" // Rust target directory
      ) {
        continue;
      }

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          this.findSourceFiles(fullPath, files);
        } else {
          const ext = extname(entry).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            // Skip test files and declaration files
            if (
              !entry.endsWith(".d.ts") &&
              !entry.includes(".test.") &&
              !entry.includes(".spec.") &&
              !entry.includes("_test.") && // Go test files
              !entry.endsWith("_test.go") &&
              !entry.endsWith("_test.py")
            ) {
              files.push(fullPath);
            }
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

    const node =
      this.store.getNode(nameOrId) ||
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
        edgeKinds: options?.edgeKinds as EdgeKind[],
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
        edgeKinds: options?.edgeKinds as EdgeKind[],
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

  // --- File Watching ---

  private startWatcher(): void {
    if (!this.workspacePath || this.watcher) return;

    // Supported extensions for watching
    const watchExtensions = this.treeSitterAnalyzer
      ? [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]
      : [".ts", ".tsx", ".js", ".jsx"];

    try {
      this.watcher = watch(
        this.workspacePath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          // Normalize path
          const relativePath = filename.replace(/\\/g, "/");

          // Skip non-source files
          const ext = extname(relativePath).toLowerCase();
          if (!watchExtensions.includes(ext)) return;

          // Skip ignored directories
          if (
            relativePath.includes("node_modules/") ||
            relativePath.includes("dist/") ||
            relativePath.includes(".git/") ||
            relativePath.includes("coverage/") ||
            relativePath.includes("__pycache__/") ||
            relativePath.includes("target/") ||
            relativePath.endsWith(".d.ts") ||
            relativePath.includes(".test.") ||
            relativePath.includes(".spec.") ||
            relativePath.includes("_test.")
          ) {
            return;
          }

          // Debounce reindex
          this.scheduleReindex();
        }
      );

      this.watcher.on("error", (error) => {
        console.error("[graph] Watch error:", error.message);
      });

      console.error("[graph] Watching for file changes");
    } catch (error) {
      console.error("[graph] Failed to start watcher:", error);
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.reindexDebounceTimer) {
      clearTimeout(this.reindexDebounceTimer);
      this.reindexDebounceTimer = null;
    }

    this.reindexPending = false;
  }

  private scheduleReindex(): void {
    // Already have a reindex scheduled
    if (this.reindexPending) return;

    this.reindexPending = true;

    // Clear any existing timer
    if (this.reindexDebounceTimer) {
      clearTimeout(this.reindexDebounceTimer);
    }

    // Schedule reindex after debounce period
    this.reindexDebounceTimer = setTimeout(async () => {
      this.reindexDebounceTimer = null;
      this.reindexPending = false;

      console.error("[graph] Files changed, reindexing...");
      const result = await this.indexWorkspace(this.workspacePath);

      if (result) {
        console.error(
          `[graph] Reindexed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges in ${Math.round(result.indexTimeMs)}ms`
        );
      }
    }, this.reindexDebounceMs);
  }
}

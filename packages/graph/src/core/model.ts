/**
 * Core data model for the semantic code graph.
 * Optimized for AI agent consumption: structured, complete, numeric confidence.
 */

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "constant"
  | "property"
  | "parameter"
  | "module"
  | "namespace"
  | "enum"
  | "constructor";

export type EdgeKind =
  | "calls"           // A invokes B
  | "reads"           // A reads variable/field B
  | "writes"          // A assigns to B
  | "returns"         // A returns type B
  | "instantiates"    // A creates instance of B
  | "inherits"        // A extends B
  | "implements"      // A implements interface B
  | "imports"         // Module A imports B
  | "exports"         // Module A exports B
  | "type_of"         // A has type B
  | "parameter_of"    // A is parameter of B
  | "contains"        // A contains B (class contains method)
  ;

/**
 * A node in the semantic graph - a code symbol with full context.
 * Includes source code so agents don't need follow-up Read calls.
 */
export interface GraphNode {
  id: string;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;        // Full path: "MyClass.myMethod"
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;

  // Full context - no need for separate Read
  signature?: string;           // Type signature
  source: string;               // The actual code
  documentation?: string;       // JSDoc/docstring

  // Queryable attributes
  isAsync: boolean;
  isExported: boolean;
  isStatic: boolean;

  // Semantic tags for filtering
  tags: string[];
}

/**
 * An edge in the graph - a relationship between symbols.
 * Confidence is numeric (0-1) for programmatic thresholding.
 */
export interface GraphEdge {
  id: string;
  source: string;               // Source node ID
  target: string;               // Target node ID
  kind: EdgeKind;
  confidence: number;           // 0.0 - 1.0

  // Location of the relationship
  file: string;
  line: number;
  column: number;

  // Context
  isConditional: boolean;       // Inside if/switch?
  isInLoop: boolean;
  isInTryCatch: boolean;

  // For call edges
  argumentMapping?: Record<number, number>;  // Caller arg N -> callee param M
}

/**
 * Query options for graph traversal.
 */
export interface QueryOptions {
  // Starting points
  from: string | string[] | { pattern?: string; tags?: string[]; kinds?: SymbolKind[] };

  // Traversal
  traverse?: {
    direction: "forward" | "backward" | "both";
    edgeKinds?: EdgeKind[];
    maxDepth?: number;
    minConfidence?: number;
  };

  // Path constraints
  mustReach?: string[];
  mustAvoid?: string[];

  // Node filtering
  filter?: {
    kinds?: SymbolKind[];
    files?: string[];
    tags?: string[];
  };

  // Output
  output?: {
    format: "nodes" | "edges" | "paths" | "subgraph";
    includeSource?: boolean;
    limit?: number;
  };
}

/**
 * A path through the graph.
 */
export interface GraphPath {
  nodes: string[];              // Node IDs in order
  edges: string[];              // Edge IDs connecting them
  confidence: number;           // Product of edge confidences
  length: number;
}

/**
 * Query result - self-contained, no follow-up needed.
 */
export interface QueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths?: GraphPath[];

  unresolved: {
    reference: string;
    reason: "dynamic" | "external" | "unknown";
    file: string;
    line: number;
  }[];

  stats: {
    nodesVisited: number;
    nodesReturned: number;
    pathsFound: number;
    queryMs: number;
  };
}

// Re-export Result from core
export type { Result } from "@agent-workbench/core";
export { Ok, Err, ok, err } from "@agent-workbench/core";

/**
 * Simplified model for semantic code graph.
 * Focus on essentials: symbols and their relationships.
 */

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "constant"
  | "enum"
  | "module";

export type EdgeKind =
  | "calls"       // A invokes B
  | "imports"     // A imports B
  | "exports"     // A exports B
  | "extends"     // A extends B
  | "implements"  // A implements B
  | "contains";   // A contains B (class contains method)

/**
 * A node in the graph - a code symbol.
 */
export interface Node {
  /** Unique ID: "file:symbolName" or "file:Class.method" */
  id: string;
  /** Symbol name */
  name: string;
  /** Qualified name: "Class.method" */
  qualifiedName: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File path */
  file: string;
  /** Start line (1-indexed) */
  line: number;
  /** Start column (1-indexed) */
  column: number;
  /** Full source code */
  source: string;
  /** Whether exported */
  isExported: boolean;
  /** Whether async */
  isAsync: boolean;
}

/**
 * An edge in the graph - a relationship.
 */
export interface Edge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Relationship kind */
  kind: EdgeKind;
  /** File where relationship is defined */
  file: string;
  /** Line where relationship occurs */
  line: number;
}

/**
 * A path through the graph.
 */
export interface Path {
  /** Node IDs in order */
  nodes: string[];
  /** Length of path */
  length: number;
}

/**
 * Graph statistics.
 */
export interface GraphStats {
  nodes: number;
  edges: number;
  files: number;
}

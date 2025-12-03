/**
 * Core domain model for insight package.
 *
 * An "insight" is a comprehensive, derived understanding of code.
 * Everything here is computed fresh from current code - nothing stored.
 */

/**
 * The type of target being analyzed.
 */
export type InsightTargetType = "file" | "directory" | "symbol";

/**
 * A symbol reference with location.
 */
export interface SymbolRef {
  name: string;
  kind: string;
  file: string;
  line: number;
}

/**
 * A code dependency (import or export).
 */
export interface Dependency {
  /** The module/file being imported from */
  source: string;
  /** Names being imported */
  names: string[];
  /** Whether it's a type-only import */
  isTypeOnly: boolean;
}

/**
 * A call relationship between symbols.
 */
export interface CallRelation {
  /** The symbol involved */
  symbol: SymbolRef;
  /** Line where the call occurs */
  line: number;
  /** Context (the line of code) */
  context: string;
}

/**
 * Recent change information from git.
 */
export interface RecentChange {
  /** Commit hash (short) */
  hash: string;
  /** Author name */
  author: string;
  /** Commit message (first line) */
  message: string;
  /** When (relative or ISO date) */
  date: string;
  /** Files changed (if applicable) */
  files?: string[];
}

/**
 * Complexity metrics for code.
 */
export interface ComplexityMetrics {
  /** Lines of code */
  lines: number;
  /** Number of symbols (functions, classes, etc.) */
  symbols: number;
  /** Number of imports */
  imports: number;
  /** Number of exports */
  exports: number;
  /** Cyclomatic complexity estimate (high/medium/low) */
  complexity: "low" | "medium" | "high";
}

/**
 * Comprehensive insight about a file.
 */
export interface FileInsight {
  type: "file";
  /** Absolute path to the file */
  path: string;
  /** Detected language */
  language: string;

  /** What this file is (brief description derived from content) */
  summary: string;

  /** Top-level structure */
  structure: {
    /** Main symbols defined in this file */
    symbols: SymbolRef[];
    /** What this file imports */
    imports: Dependency[];
    /** What this file exports */
    exports: string[];
  };

  /** Relationships */
  relationships: {
    /** Files that import this file */
    importedBy: string[];
    /** Files this file imports from (resolved paths) */
    importsFrom: string[];
  };

  /** Recent changes */
  recentChanges: RecentChange[];

  /** Complexity metrics */
  metrics: ComplexityMetrics;

  /** Potential issues or notes */
  notes: string[];
}

/**
 * Comprehensive insight about a directory/module.
 */
export interface DirectoryInsight {
  type: "directory";
  /** Path to the directory */
  path: string;

  /** What this module is (brief description) */
  summary: string;

  /** Structure */
  structure: {
    /** Files in this directory */
    files: string[];
    /** Subdirectories */
    subdirectories: string[];
    /** Entry points (index files, main exports) */
    entryPoints: string[];
    /** Key symbols across all files */
    keySymbols: SymbolRef[];
  };

  /** Relationships */
  relationships: {
    /** External dependencies (packages) */
    externalDeps: string[];
    /** Internal dependencies (other directories/modules) */
    internalDeps: string[];
    /** Who depends on this module */
    dependents: string[];
  };

  /** Recent changes across all files */
  recentChanges: RecentChange[];

  /** Aggregate metrics */
  metrics: ComplexityMetrics;

  /** Potential issues or notes */
  notes: string[];
}

/**
 * Comprehensive insight about a symbol (function, class, etc.).
 */
export interface SymbolInsight {
  type: "symbol";
  /** Symbol name */
  name: string;
  /** Full name path (e.g., "MyClass/myMethod") */
  namePath: string;
  /** Kind of symbol */
  kind: string;
  /** File where defined */
  file: string;
  /** Line number */
  line: number;

  /** What this symbol does (brief description) */
  summary: string;

  /** The actual code */
  code: string;

  /** Signature (for functions/methods) */
  signature?: string;

  /** Relationships */
  relationships: {
    /** What this symbol calls */
    calls: CallRelation[];
    /** What calls this symbol */
    calledBy: CallRelation[];
    /** Related symbols (same class, similar name) */
    related: SymbolRef[];
  };

  /** Recent changes to this symbol */
  recentChanges: RecentChange[];

  /** Potential issues or notes */
  notes: string[];
}

/**
 * Union type for all insight types.
 */
export type Insight = FileInsight | DirectoryInsight | SymbolInsight;

/**
 * Options for generating insights.
 */
export interface InsightOptions {
  /** Maximum depth for relationship traversal */
  maxDepth?: number;
  /** Include code snippets */
  includeCode?: boolean;
  /** Maximum number of recent changes to include */
  maxChanges?: number;
  /** Include callers/callees */
  includeCallGraph?: boolean;
}

/**
 * Default options.
 */
export const DEFAULT_OPTIONS: Required<InsightOptions> = {
  maxDepth: 2,
  includeCode: true,
  maxChanges: 5,
  includeCallGraph: true,
};

/**
 * Core domain types for the syntax package.
 */

export type SymbolKind =
  | "file"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "property"
  | "variable"
  | "constant"
  | "enum"
  | "enum_member"
  | "type_alias"
  | "namespace"
  | "module"
  | "constructor"
  | "field"
  | "parameter"
  | "import";

export interface Location {
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
  /** 0-indexed byte offset from start of file */
  offset: number;
}

export interface Span {
  start: Location;
  end: Location;
}

export interface Symbol {
  /** Symbol name (e.g., "myFunction", "MyClass") */
  name: string;
  /** Type of symbol */
  kind: SymbolKind;
  /** Full span of the symbol in the source */
  span: Span;
  /** Span of just the body (for functions/methods, excludes signature) */
  bodySpan?: Span;
  /** Child symbols (e.g., methods of a class) */
  children: Symbol[];
  /** Documentation comment (JSDoc, docstring, etc.) */
  documentation?: string;
  /** Language-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface Language {
  id: string;
  name: string;
  extensions: string[];
  aliases?: string[];
}

export const LANGUAGES: Record<string, Language> = {
  typescript: {
    id: "typescript",
    name: "TypeScript",
    extensions: [".ts", ".tsx", ".mts", ".cts"],
  },
  javascript: {
    id: "javascript",
    name: "JavaScript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
  },
  python: {
    id: "python",
    name: "Python",
    extensions: [".py", ".pyi"],
  },
  go: {
    id: "go",
    name: "Go",
    extensions: [".go"],
  },
  rust: {
    id: "rust",
    name: "Rust",
    extensions: [".rs"],
  },
};

/**
 * Detect language from file path extension.
 */
export function detectLanguage(filePath: string): Language | undefined {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  for (const lang of Object.values(LANGUAGES)) {
    if (lang.extensions.includes(ext)) {
      return lang;
    }
  }
  return undefined;
}

/**
 * Simplified symbol info for listing (without full spans).
 */
export interface SymbolInfo {
  name: string;
  namePath: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  children?: SymbolInfo[];
}

/**
 * Result of reading a symbol.
 */
export interface SymbolContent {
  name: string;
  namePath: string;
  kind: SymbolKind;
  body: string;
  startLine: number;
  endLine: number;
}

/**
 * Result of an edit operation.
 */
export interface EditResult {
  filePath: string;
  linesChanged: number;
  oldLineCount: number;
  newLineCount: number;
}

/**
 * A reference/usage of a symbol.
 */
export interface SymbolReference {
  /** File containing the reference */
  filePath: string;
  /** Name of the symbol being referenced */
  symbolName: string;
  /** Line number of the reference */
  line: number;
  /** Column number */
  column: number;
  /** The context line (for display) */
  context: string;
  /** Whether this is the definition (vs a usage) */
  isDefinition: boolean;
}

/**
 * Information about a function/method call.
 */
export interface CallInfo {
  /** Name of the function/method being called */
  callee: string;
  /** Line number where the call occurs */
  line: number;
  /** Column number */
  column: number;
  /** Full text of the call expression */
  callText: string;
}

/**
 * Call hierarchy entry showing caller-callee relationship.
 */
export interface CallHierarchyItem {
  /** Symbol name (function/method) */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File path */
  filePath: string;
  /** Line where symbol is defined */
  line: number;
  /** Calls made by this symbol (for outgoing) or calls to this symbol (for incoming) */
  calls: CallSite[];
}

/**
 * A specific call site.
 */
export interface CallSite {
  /** File where the call occurs */
  filePath: string;
  /** Line of the call */
  line: number;
  /** Column of the call */
  column: number;
  /** Name of the calling/called function */
  fromSymbol?: string;
  /** Context line */
  context: string;
}

/**
 * Type of import statement.
 */
export type ImportType =
  | "default"      // import Foo from "module"
  | "named"        // import { foo, bar } from "module"
  | "namespace"    // import * as foo from "module"
  | "side_effect"  // import "module"
  | "type"         // import type { Foo } from "module"
  | "require";     // const foo = require("module")

/**
 * A single imported binding.
 */
export interface ImportBinding {
  /** Local name (what you use in code) */
  name: string;
  /** Original name (if aliased, e.g., "foo" in "foo as bar") */
  originalName?: string;
  /** Whether this is a type-only import */
  isType?: boolean;
}

/**
 * Information about an import statement.
 */
export interface ImportInfo {
  /** Source module (e.g., "./utils", "lodash", "@org/pkg") */
  source: string;
  /** Type of import */
  type: ImportType;
  /** Imported bindings (names) */
  bindings: ImportBinding[];
  /** Line number */
  line: number;
  /** Whether import is dynamic (import()) */
  isDynamic?: boolean;
  /** Full import statement text */
  raw: string;
}

/**
 * Type of export statement.
 */
export type ExportType =
  | "default"       // export default foo
  | "named"         // export { foo, bar }
  | "declaration"   // export function foo() {}
  | "reexport"      // export { foo } from "module"
  | "namespace";    // export * from "module"

/**
 * A single exported binding.
 */
export interface ExportBinding {
  /** Exported name (what consumers import) */
  name: string;
  /** Local name (if aliased, e.g., "foo" in "export { foo as bar }") */
  localName?: string;
  /** Whether this is a type-only export */
  isType?: boolean;
  /** Symbol kind if from a declaration */
  kind?: SymbolKind;
}

/**
 * Information about an export statement.
 */
export interface ExportInfo {
  /** Type of export */
  type: ExportType;
  /** Exported bindings */
  bindings: ExportBinding[];
  /** Re-export source (for reexports) */
  source?: string;
  /** Line number */
  line: number;
  /** Full export statement text */
  raw: string;
}

/**
 * A node in the dependency graph.
 */
export interface DependencyNode {
  /** File path (relative to project root) */
  filePath: string;
  /** Direct dependencies (files this file imports) */
  dependencies: string[];
  /** Dependents (files that import this file) */
  dependents: string[];
}

/**
 * A circular dependency cycle.
 */
export interface CircularDependency {
  /** Files in the cycle, in order */
  cycle: string[];
  /** The import that completes the cycle */
  closingImport: {
    from: string;
    to: string;
    line: number;
  };
}

/**
 * Result of dependency analysis.
 */
export interface DependencyAnalysis {
  /** Total number of files analyzed */
  totalFiles: number;
  /** Total number of import statements */
  totalImports: number;
  /** Files with the most dependencies */
  highestDependencyCount: { file: string; count: number }[];
  /** Files with the most dependents */
  mostImported: { file: string; count: number }[];
  /** Circular dependencies found */
  circularDependencies: CircularDependency[];
  /** Whether the project has any circular dependencies */
  hasCircularDependencies: boolean;
}

// ============================================================================
// Call Graph Types (for trace, findPaths, findDeadCode)
// ============================================================================

/**
 * An edge in the call graph representing a call relationship.
 */
export interface CallEdge {
  /** Caller symbol ID (file:namePath) */
  from: string;
  /** Callee symbol ID (file:namePath) */
  to: string;
  /** Line where the call occurs */
  line: number;
}

/**
 * A symbol node in the call graph.
 */
export interface GraphNode {
  /** Unique ID: "file:namePath" */
  id: string;
  /** Symbol name */
  name: string;
  /** Full name path (e.g., "MyClass.myMethod") */
  namePath: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File path (relative to project root) */
  file: string;
  /** Start line */
  line: number;
  /** Whether exported from its module */
  isExported: boolean;
}

/**
 * Result of a trace operation.
 */
export interface TraceResult {
  /** Starting symbol */
  from: string;
  /** Direction of trace */
  direction: "forward" | "backward";
  /** Maximum depth used */
  depth: number;
  /** Reachable symbols with their distance */
  reachable: Array<{
    node: GraphNode;
    depth: number;
  }>;
}

/**
 * A path through the call graph.
 */
export interface GraphPath {
  /** Node IDs in order from start to end */
  nodes: string[];
  /** Length of path (number of edges) */
  length: number;
}

/**
 * Result of path finding.
 */
export interface FindPathsResult {
  /** Starting symbol */
  from: string;
  /** Target symbol */
  to: string;
  /** Paths found (sorted by length) */
  paths: GraphPath[];
}

/**
 * A potentially dead code item.
 */
export interface DeadCodeItem {
  /** Symbol info */
  node: GraphNode;
  /** Why this is considered dead */
  reason: string;
}

/**
 * Result of dead code analysis.
 */
export interface DeadCodeResult {
  /** Total symbols analyzed */
  totalSymbols: number;
  /** Number of entry points (exports) */
  entryPoints: number;
  /** Dead code items found */
  deadCode: DeadCodeItem[];
}

/**
 * An indexed symbol with file location information.
 * Used by ProjectIndex and related services.
 */
export interface IndexedSymbol {
  name: string;
  namePath: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  endLine: number;
}

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

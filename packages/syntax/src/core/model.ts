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

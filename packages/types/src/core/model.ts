/**
 * Core domain types for the types package.
 * These types are language-agnostic where possible,
 * enabling future support for other typed languages.
 */

/**
 * Severity of a diagnostic message.
 */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

/**
 * Category of a diagnostic.
 */
export type DiagnosticCategory =
  | "semantic"      // Type errors, undefined variables
  | "syntactic"     // Parse errors
  | "declaration"   // Missing declarations
  | "suggestion";   // Improvement suggestions

/**
 * A diagnostic message (error, warning, etc.) from the type checker.
 */
export interface Diagnostic {
  /** File containing the diagnostic */
  file: string;
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
  /** End line (1-indexed) */
  endLine: number;
  /** End column (1-indexed) */
  endColumn: number;
  /** Human-readable error message */
  message: string;
  /** Compiler error code (e.g., TS2304) */
  code: string;
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Diagnostic category */
  category: DiagnosticCategory;
  /** Source of the diagnostic (e.g., "typescript") */
  source: string;
  /** Related information (e.g., "did you mean...") */
  relatedInfo?: RelatedDiagnosticInfo[];
}

/**
 * Additional context for a diagnostic.
 */
export interface RelatedDiagnosticInfo {
  file: string;
  line: number;
  column: number;
  message: string;
}

/**
 * Type information at a specific position.
 * The result of hovering over a symbol.
 */
export interface TypeInfo {
  /** The type as a displayable string */
  type: string;
  /** Symbol name at position */
  name: string;
  /** Kind of symbol (variable, function, class, etc.) */
  kind: SymbolKind;
  /** JSDoc or documentation comment */
  documentation?: string;
  /** Tags from JSDoc (@param, @returns, etc.) */
  tags?: DocTag[];
}

/**
 * Kind of a symbol in the type system.
 */
export type SymbolKind =
  | "variable"
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "enum_member"
  | "property"
  | "method"
  | "parameter"
  | "type_parameter"
  | "module"
  | "keyword"
  | "unknown";

/**
 * A documentation tag from JSDoc.
 */
export interface DocTag {
  name: string;
  text?: string;
}

/**
 * A location in source code.
 */
export interface Location {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/**
 * A definition location with context.
 */
export interface Definition extends Location {
  /** Name of the defined symbol */
  name: string;
  /** Kind of definition */
  kind: SymbolKind;
  /** Preview of the definition (first line of code) */
  preview?: string;
  /** Container name (e.g., class name for a method) */
  containerName?: string;
}

/**
 * A quick fix or refactoring action.
 */
export interface CodeAction {
  /** Human-readable title */
  title: string;
  /** Kind of action (quickfix, refactor, etc.) */
  kind: CodeActionKind;
  /** Whether this is the preferred action */
  isPreferred?: boolean;
  /** File edits to apply */
  edits: FileEdit[];
  /** Commands to execute after edits */
  commands?: Command[];
}

export type CodeActionKind =
  | "quickfix"
  | "refactor"
  | "refactor.extract"
  | "refactor.inline"
  | "refactor.move"
  | "source"
  | "source.organizeImports"
  | "source.fixAll";

/**
 * Edits for a single file.
 */
export interface FileEdit {
  file: string;
  changes: TextChange[];
}

/**
 * A single text change.
 */
export interface TextChange {
  /** Start position (1-indexed) */
  start: { line: number; column: number };
  /** End position (1-indexed) */
  end: { line: number; column: number };
  /** New text to insert */
  newText: string;
}

/**
 * A command to execute.
 */
export interface Command {
  title: string;
  command: string;
  arguments?: unknown[];
}

/**
 * Summary of diagnostics for a project or file.
 */
export interface DiagnosticSummary {
  /** Total number of errors */
  errorCount: number;
  /** Total number of warnings */
  warningCount: number;
  /** Total number of info messages */
  infoCount: number;
  /** Total number of hints */
  hintCount: number;
  /** Files with diagnostics */
  filesWithDiagnostics: number;
  /** Total files analyzed */
  totalFiles: number;
}

/**
 * Project configuration info.
 */
export interface ProjectInfo {
  /** Path to tsconfig.json */
  configPath: string;
  /** Root directory of the project */
  rootDir: string;
  /** Number of files in the project */
  fileCount: number;
  /** Compiler options summary */
  compilerOptions: {
    target?: string;
    module?: string;
    strict?: boolean;
    [key: string]: unknown;
  };
}

import type { Result } from "@agent-workbench/core";
import type {
  Diagnostic,
  DiagnosticSummary,
  TypeInfo,
  Definition,
  CodeAction,
  ProjectInfo,
} from "../model.js";

/**
 * Options for getting diagnostics.
 */
export interface GetDiagnosticsOptions {
  /** Specific file to check (if omitted, checks entire project) */
  file?: string;
  /** Include only errors (no warnings/hints) */
  errorsOnly?: boolean;
  /** Maximum number of diagnostics to return */
  limit?: number;
}

/**
 * Options for getting type info.
 */
export interface GetTypeOptions {
  /** File path */
  file: string;
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
}

/**
 * Options for getting definitions.
 */
export interface GetDefinitionOptions {
  /** File path */
  file: string;
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
}

/**
 * Options for getting code actions.
 */
export interface GetCodeActionsOptions {
  /** File path */
  file: string;
  /** Start line (1-indexed) */
  startLine: number;
  /** Start column (1-indexed) */
  startColumn: number;
  /** End line (1-indexed) */
  endLine: number;
  /** End column (1-indexed) */
  endColumn: number;
  /** Specific diagnostic codes to get fixes for */
  diagnosticCodes?: string[];
}

/**
 * Port for type system operations.
 * This abstraction allows for different language backends.
 */
export interface TypeService {
  /**
   * Initialize the type service for a project.
   * Finds and parses tsconfig.json, sets up the language service.
   *
   * @param projectPath - Path to project root or tsconfig.json
   */
  initialize(projectPath: string): Promise<Result<ProjectInfo, Error>>;

  /**
   * Reload the type service, re-discovering tsconfig.json files.
   * Use this when new packages are added to a monorepo.
   */
  reload(): Promise<Result<ProjectInfo, Error>>;

  /**
   * Check if the service is initialized.
   */
  isInitialized(): boolean;

  /**
   * Get the project info.
   */
  getProjectInfo(): Result<ProjectInfo, Error>;

  /**
   * Get diagnostics (type errors, etc.) for a file or project.
   */
  getDiagnostics(options?: GetDiagnosticsOptions): Promise<Result<Diagnostic[], Error>>;

  /**
   * Get a summary of diagnostics for the project.
   */
  getDiagnosticSummary(): Promise<Result<DiagnosticSummary, Error>>;

  /**
   * Get type information at a specific position.
   * Equivalent to hovering over a symbol in an IDE.
   */
  getTypeAtPosition(options: GetTypeOptions): Result<TypeInfo, Error>;

  /**
   * Go to definition for a symbol at a position.
   */
  getDefinition(options: GetDefinitionOptions): Result<Definition[], Error>;

  /**
   * Find all references to a symbol at a position.
   */
  findReferences(options: GetDefinitionOptions): Result<Definition[], Error>;

  /**
   * Get available code actions (quick fixes, refactorings) at a position.
   */
  getCodeActions(options: GetCodeActionsOptions): Result<CodeAction[], Error>;

  /**
   * Notify the service that a file has changed.
   * Call this when you edit a file to keep diagnostics up to date.
   */
  notifyFileChanged(file: string, content?: string): void;

  /**
   * Dispose of resources.
   */
  dispose(): void;
}

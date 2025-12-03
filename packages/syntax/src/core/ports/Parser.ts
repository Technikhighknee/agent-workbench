import type { Result } from "@agent-workbench/core";

import { CallInfo, ExportInfo, ImportInfo, Language, Span } from "../model.js";
import { SymbolTree } from "../symbolTree.js";

export interface ParseError {
  message: string;
  span: Span;
}

export interface ParseResult {
  tree: SymbolTree;
  errors: ParseError[];
}

/**
 * Port for parsing source code into a symbol tree.
 */
export interface Parser {
  /**
   * Parse source code into a symbol tree.
   *
   * @param source - The source code to parse
   * @param filePath - Path to the file (used for language detection)
   * @returns Parsed symbol tree or error
   */
  parse(source: string, filePath: string): Promise<Result<ParseResult, Error>>;

  /**
   * Extract import statements from source code.
   *
   * @param source - The source code to analyze
   * @param filePath - Path to the file (used for language detection)
   * @returns List of import information
   */
  extractImports(source: string, filePath: string): Promise<Result<ImportInfo[], Error>>;

  /**
   * Extract export statements from source code.
   *
   * @param source - The source code to analyze
   * @param filePath - Path to the file (used for language detection)
   * @returns List of export information
   */
  extractExports(source: string, filePath: string): Promise<Result<ExportInfo[], Error>>;

  /**
   * Extract function/method calls from source code.
   *
   * @param source - The source code to analyze
   * @param filePath - Path to the file (used for language detection)
   * @returns List of call information
   */
  extractCalls(source: string, filePath: string): Promise<Result<CallInfo[], Error>>;

  /**
   * Get list of supported language IDs.
   */
  supportedLanguages(): string[];

  /**
   * Detect language from file path.
   */
  detectLanguage(filePath: string): Language | undefined;
}

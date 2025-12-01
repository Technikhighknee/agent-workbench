import { Result } from "../result.js";
import { SymbolTree } from "../symbolTree.js";
import { Language, Span } from "../model.js";

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
   * Get list of supported language IDs.
   */
  supportedLanguages(): string[];

  /**
   * Detect language from file path.
   */
  detectLanguage(filePath: string): Language | undefined;
}

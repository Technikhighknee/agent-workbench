import { Err, Ok, Result } from "@agent-workbench/core";
import Parser from "tree-sitter";

import { CallInfo, ExportInfo, ImportInfo, LANGUAGES, Language, detectLanguage } from "../../core/model.js";
import { ParseResult, Parser as ParserPort } from "../../core/ports/Parser.js";
import { findExportStatements } from "./ExportExtractor.js";
import { findImportStatements } from "./ImportExtractor.js";
import { extractErrors, extractSymbols } from "./SymbolExtractor.js";

// Tree-sitter language type (uses any in the typings)
type TreeSitterLanguage = unknown;

// Language grammars - dynamically imported
type GrammarLoader = () => Promise<TreeSitterLanguage>;

const GRAMMAR_LOADERS: Record<string, GrammarLoader> = {
  typescript: async () => {
    const mod = await import("tree-sitter-typescript");
    return mod.default.typescript;
  },
  tsx: async () => {
    const mod = await import("tree-sitter-typescript");
    return mod.default.tsx;
  },
  javascript: async () => {
    const mod = await import("tree-sitter-javascript");
    return mod.default;
  },
  python: async () => {
    const mod = await import("tree-sitter-python");
    return mod.default;
  },
  go: async () => {
    const mod = await import("tree-sitter-go");
    return mod.default;
  },
  rust: async () => {
    const mod = await import("tree-sitter-rust");
    return mod.default;
  },
};

/**
 * Tree-sitter based parser implementation.
 */
export class TreeSitterParser implements ParserPort {
  private readonly parser: Parser;
  private readonly loadedGrammars = new Map<string, TreeSitterLanguage>();

  constructor() {
    this.parser = new Parser();
  }

  async parse(source: string, filePath: string): Promise<Result<ParseResult, Error>> {
    const lang = this.detectLanguage(filePath);
    if (!lang) {
      return Err(new Error(`Unsupported file type: ${filePath}`));
    }

    try {
      const grammar = await this.getGrammar(lang.id, filePath);
      this.parser.setLanguage(grammar);

      const tree = this.parser.parse(source);
      const symbols = extractSymbols(tree.rootNode, source, lang.id);
      const errors = extractErrors(tree.rootNode);

      return Ok({
        tree: {
          filePath,
          language: lang.id,
          symbols,
        },
        errors,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  supportedLanguages(): string[] {
    return Object.keys(LANGUAGES);
  }

  detectLanguage(filePath: string): Language | undefined {
    return detectLanguage(filePath);
  }

  /**
   * Extract function/method calls from source code.
   * Used for building call hierarchy.
   */
  async extractCalls(source: string, filePath: string): Promise<Result<CallInfo[], Error>> {
    const lang = this.detectLanguage(filePath);
    if (!lang) {
      return Err(new Error(`Unsupported file type: ${filePath}`));
    }

    try {
      const grammar = await this.getGrammar(lang.id, filePath);
      this.parser.setLanguage(grammar);
      const tree = this.parser.parse(source);

      const calls: CallInfo[] = [];
      this.findCallExpressions(tree.rootNode, source, calls);

      return Ok(calls);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Extract import statements from source code.
   */
  async extractImports(source: string, filePath: string): Promise<Result<ImportInfo[], Error>> {
    const lang = this.detectLanguage(filePath);
    if (!lang) {
      return Err(new Error(`Unsupported file type: ${filePath}`));
    }

    try {
      const grammar = await this.getGrammar(lang.id, filePath);
      this.parser.setLanguage(grammar);
      const tree = this.parser.parse(source);

      const imports: ImportInfo[] = [];
      findImportStatements(tree.rootNode, lang.id, imports);

      return Ok(imports);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Extract export statements from source code.
   */
  async extractExports(source: string, filePath: string): Promise<Result<ExportInfo[], Error>> {
    const lang = this.detectLanguage(filePath);
    if (!lang) {
      return Err(new Error(`Unsupported file type: ${filePath}`));
    }

    try {
      const grammar = await this.getGrammar(lang.id, filePath);
      this.parser.setLanguage(grammar);
      const tree = this.parser.parse(source);

      const exports: ExportInfo[] = [];
      findExportStatements(tree.rootNode, lang.id, exports);

      return Ok(exports);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Recursively find all call expressions in a node.
   */
  private findCallExpressions(
    node: Parser.SyntaxNode,
    source: string,
    calls: CallInfo[]
  ): void {
    if (node.type === "call_expression") {
      const callee = this.extractCalleeName(node);
      if (callee) {
        calls.push({
          callee,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          callText: node.text.slice(0, 50), // Truncate for display
        });
      }
    }

    // Recurse into children
    for (const child of node.children) {
      this.findCallExpressions(child, source, calls);
    }
  }

  /**
   * Extract the function/method name from a call expression.
   */
  private extractCalleeName(callNode: Parser.SyntaxNode): string | null {
    const callee = callNode.children[0];
    if (!callee) return null;

    // Direct function call: identifier
    if (callee.type === "identifier") {
      return callee.text;
    }

    // Method call: member_expression
    if (callee.type === "member_expression") {
      // Get the property (method name)
      const property = callee.children.find(
        (c) => c.type === "property_identifier" || c.type === "identifier"
      );
      if (property) {
        return property.text;
      }
    }

    return null;
  }

  private async getGrammar(languageId: string, filePath: string): Promise<TreeSitterLanguage> {
    // Handle TSX files specially
    let grammarKey = languageId;
    if (languageId === "typescript" && filePath.endsWith(".tsx")) {
      grammarKey = "tsx";
    }

    const cached = this.loadedGrammars.get(grammarKey);
    if (cached) return cached;

    const loader = GRAMMAR_LOADERS[grammarKey];
    if (!loader) {
      throw new Error(`No grammar loader for: ${grammarKey}`);
    }

    const grammar = await loader();
    this.loadedGrammars.set(grammarKey, grammar);
    return grammar;
  }
}

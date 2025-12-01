import Parser from "tree-sitter";
import { Parser as ParserPort, ParseResult, ParseError } from "../../core/ports/Parser.js";
import { Result, Ok, Err } from "../../core/result.js";
import { SymbolTree } from "../../core/symbolTree.js";
import { Symbol, SymbolKind, Language, LANGUAGES, detectLanguage, Span, Location } from "../../core/model.js";

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
      const symbols = this.extractSymbols(tree.rootNode, source, lang.id);
      const errors = this.extractErrors(tree.rootNode);

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

  private extractSymbols(node: Parser.SyntaxNode, source: string, language: string): Symbol[] {
    const symbols: Symbol[] = [];

    for (const child of node.children) {
      const symbol = this.nodeToSymbol(child, source, language);
      if (symbol) {
        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private nodeToSymbol(node: Parser.SyntaxNode, source: string, language: string): Symbol | null {
    const kind = this.getSymbolKind(node.type, language);
    if (!kind) return null;

    const name = this.getSymbolName(node, language);
    if (!name) return null;

    const span = this.nodeToSpan(node);
    const bodySpan = this.getBodySpan(node, language);
    const children = this.extractChildSymbols(node, source, language);

    return {
      name,
      kind,
      span,
      bodySpan,
      children,
    };
  }

  private extractChildSymbols(node: Parser.SyntaxNode, source: string, language: string): Symbol[] {
    const symbols: Symbol[] = [];

    // Find the body node for classes/functions
    const bodyNode = this.findBodyNode(node, language);
    const searchNode = bodyNode ?? node;

    for (const child of searchNode.children) {
      const symbol = this.nodeToSymbol(child, source, language);
      if (symbol) {
        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private findBodyNode(node: Parser.SyntaxNode, language: string): Parser.SyntaxNode | null {
    // Language-specific body node names
    const bodyTypes: Record<string, string[]> = {
      typescript: ["class_body", "statement_block", "object"],
      javascript: ["class_body", "statement_block", "object"],
      python: ["block"],
      go: ["block"],
      rust: ["declaration_list", "block"],
    };

    const types = bodyTypes[language] ?? [];

    for (const child of node.children) {
      if (types.includes(child.type)) {
        return child;
      }
    }

    return null;
  }

  private getSymbolKind(nodeType: string, language: string): SymbolKind | null {
    // TypeScript/JavaScript
    if (language === "typescript" || language === "javascript") {
      switch (nodeType) {
        case "class_declaration":
        case "class":
          return "class";
        case "interface_declaration":
          return "interface";
        case "function_declaration":
        case "arrow_function":
        case "generator_function_declaration":
          return "function";
        case "method_definition":
          return "method";
        case "public_field_definition":
        case "property_signature":
          return "property";
        case "lexical_declaration":
        case "variable_declaration":
          return "variable";
        case "type_alias_declaration":
          return "type_alias";
        case "enum_declaration":
          return "enum";
        case "namespace_declaration":
        case "module":
          return "namespace";
        case "import_statement":
          return "import";
        default:
          return null;
      }
    }

    // Python
    if (language === "python") {
      switch (nodeType) {
        case "class_definition":
          return "class";
        case "function_definition":
          return "function";
        case "assignment":
        case "expression_statement":
          return "variable";
        case "import_statement":
        case "import_from_statement":
          return "import";
        default:
          return null;
      }
    }

    // Go
    if (language === "go") {
      switch (nodeType) {
        case "type_declaration":
          return "type_alias";
        case "function_declaration":
          return "function";
        case "method_declaration":
          return "method";
        case "var_declaration":
        case "const_declaration":
        case "short_var_declaration":
          return "variable";
        case "import_declaration":
          return "import";
        default:
          return null;
      }
    }

    // Rust
    if (language === "rust") {
      switch (nodeType) {
        case "struct_item":
          return "class";
        case "trait_item":
          return "interface";
        case "function_item":
          return "function";
        case "impl_item":
          return "class";
        case "enum_item":
          return "enum";
        case "type_item":
          return "type_alias";
        case "const_item":
          return "constant";
        case "static_item":
          return "variable";
        case "mod_item":
          return "module";
        case "use_declaration":
          return "import";
        default:
          return null;
      }
    }

    return null;
  }

  private getSymbolName(node: Parser.SyntaxNode, language: string): string | null {
    // Look for identifier/name child nodes
    const nameNodeTypes = ["identifier", "name", "property_identifier", "type_identifier"];

    for (const child of node.children) {
      if (nameNodeTypes.includes(child.type)) {
        return child.text;
      }
    }

    // For variable declarations, look deeper
    if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
      for (const child of node.children) {
        if (child.type === "variable_declarator") {
          for (const grandchild of child.children) {
            if (grandchild.type === "identifier") {
              return grandchild.text;
            }
          }
        }
      }
    }

    // Python assignments
    if (node.type === "assignment" || node.type === "expression_statement") {
      const assignment = node.type === "expression_statement"
        ? node.children.find(c => c.type === "assignment")
        : node;

      if (assignment) {
        for (const child of assignment.children) {
          if (child.type === "identifier") {
            return child.text;
          }
        }
      }
    }

    return null;
  }

  private nodeToSpan(node: Parser.SyntaxNode): Span {
    return {
      start: {
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        offset: node.startIndex,
      },
      end: {
        line: node.endPosition.row + 1,
        column: node.endPosition.column + 1,
        offset: node.endIndex,
      },
    };
  }

  private getBodySpan(node: Parser.SyntaxNode, language: string): Span | undefined {
    const bodyNode = this.findBodyNode(node, language);
    if (!bodyNode) return undefined;
    return this.nodeToSpan(bodyNode);
  }

  private extractErrors(node: Parser.SyntaxNode): ParseError[] {
    const errors: ParseError[] = [];

    function traverse(n: Parser.SyntaxNode): void {
      if (n.type === "ERROR" || n.isMissing) {
        errors.push({
          message: n.isMissing ? `Missing: ${n.type}` : `Syntax error`,
          span: {
            start: {
              line: n.startPosition.row + 1,
              column: n.startPosition.column + 1,
              offset: n.startIndex,
            },
            end: {
              line: n.endPosition.row + 1,
              column: n.endPosition.column + 1,
              offset: n.endIndex,
            },
          },
        });
      }

      for (const child of n.children) {
        traverse(child);
      }
    }

    traverse(node);
    return errors;
  }
}

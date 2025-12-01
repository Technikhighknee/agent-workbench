import Parser from "tree-sitter";
import { Parser as ParserPort, ParseResult, ParseError } from "../../core/ports/Parser.js";
import { Result, Ok, Err } from "@agent-workbench/core";
import { Symbol, SymbolKind, Language, LANGUAGES, detectLanguage, Span, CallInfo, ImportInfo, ImportBinding, ImportType, ExportInfo, ExportBinding, ExportType } from "../../core/model.js";

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
      this.findImportStatements(tree.rootNode, lang.id, imports);

      return Ok(imports);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Recursively find all import statements in a node.
   */
  private findImportStatements(
    node: Parser.SyntaxNode,
    language: string,
    imports: ImportInfo[]
  ): void {
    // TypeScript/JavaScript imports
    if (language === "typescript" || language === "javascript") {
      if (node.type === "import_statement") {
        const info = this.extractTsImport(node);
        if (info) imports.push(info);
      }
    }

    // Python imports
    if (language === "python") {
      if (node.type === "import_statement" || node.type === "import_from_statement") {
        const info = this.extractPyImport(node);
        if (info) imports.push(info);
      }
    }

    // Go imports
    if (language === "go") {
      if (node.type === "import_declaration") {
        const infos = this.extractGoImports(node);
        imports.push(...infos);
      }
    }

    // Rust imports
    if (language === "rust") {
      if (node.type === "use_declaration") {
        const info = this.extractRustImport(node);
        if (info) imports.push(info);
      }
    }

    // Recurse into children
    for (const child of node.children) {
      this.findImportStatements(child, language, imports);
    }
  }

  /**
   * Extract TypeScript/JavaScript import.
   */
  private extractTsImport(node: Parser.SyntaxNode): ImportInfo | null {
    const bindings: ImportBinding[] = [];
    let source = "";
    let importType: ImportType = "named";
    let isTypeOnly = false;

    for (const child of node.children) {
      // Check for "type" keyword (import type {...})
      if (child.type === "type") {
        isTypeOnly = true;
      }

      // Source module string
      if (child.type === "string") {
        source = child.text.slice(1, -1); // Remove quotes
      }

      // Import clause contains the bindings
      if (child.type === "import_clause") {
        for (const clauseChild of child.children) {
          // Default import: import Foo from "module"
          if (clauseChild.type === "identifier") {
            bindings.push({ name: clauseChild.text, isType: isTypeOnly });
            importType = "default";
          }

          // Namespace import: import * as foo from "module"
          if (clauseChild.type === "namespace_import") {
            const ident = clauseChild.children.find((c) => c.type === "identifier");
            if (ident) {
              bindings.push({ name: ident.text, isType: isTypeOnly });
              importType = "namespace";
            }
          }

          // Named imports: import { foo, bar } from "module"
          if (clauseChild.type === "named_imports") {
            for (const spec of clauseChild.children) {
              if (spec.type === "import_specifier") {
                const names = spec.children.filter((c) => c.type === "identifier");
                if (names.length === 2) {
                  // Aliased: import { foo as bar }
                  bindings.push({
                    name: names[1].text,
                    originalName: names[0].text,
                    isType: isTypeOnly,
                  });
                } else if (names.length === 1) {
                  bindings.push({ name: names[0].text, isType: isTypeOnly });
                }
              }
            }
            if (importType !== "default") {
              importType = isTypeOnly ? "type" : "named";
            }
          }
        }
      }
    }

    // Side-effect import: import "module"
    if (bindings.length === 0 && source) {
      importType = "side_effect";
    }

    if (!source) return null;

    return {
      source,
      type: importType,
      bindings,
      line: node.startPosition.row + 1,
      raw: node.text,
    };
  }

  /**
   * Extract Python import.
   */
  private extractPyImport(node: Parser.SyntaxNode): ImportInfo | null {
    const bindings: ImportBinding[] = [];
    let source = "";
    let importType: ImportType = "named";

    if (node.type === "import_statement") {
      // import foo, bar
      for (const child of node.children) {
        if (child.type === "dotted_name") {
          bindings.push({ name: child.text });
          if (!source) source = child.text;
        }
        if (child.type === "aliased_import") {
          const name = child.children.find((c) => c.type === "dotted_name");
          const alias = child.children.find((c) => c.type === "identifier");
          if (name) {
            bindings.push({
              name: alias?.text || name.text,
              originalName: alias ? name.text : undefined,
            });
            if (!source) source = name.text;
          }
        }
      }
      importType = "namespace";
    } else if (node.type === "import_from_statement") {
      // from foo import bar, baz
      for (const child of node.children) {
        if (child.type === "dotted_name" || child.type === "relative_import") {
          source = child.text;
        }
        if (child.type === "identifier") {
          bindings.push({ name: child.text });
        }
        if (child.type === "aliased_import") {
          const name = child.children.find(
            (c) => c.type === "identifier" || c.type === "dotted_name"
          );
          const alias = child.children.find(
            (c, i) => c.type === "identifier" && i > 0
          );
          if (name) {
            bindings.push({
              name: alias?.text || name.text,
              originalName: alias ? name.text : undefined,
            });
          }
        }
        if (child.type === "wildcard_import") {
          bindings.push({ name: "*" });
          importType = "namespace";
        }
      }
    }

    if (!source) return null;

    return {
      source,
      type: importType,
      bindings,
      line: node.startPosition.row + 1,
      raw: node.text,
    };
  }

  /**
   * Extract Go import(s) - can have multiple in one declaration.
   */
  private extractGoImports(node: Parser.SyntaxNode): ImportInfo[] {
    const imports: ImportInfo[] = [];

    for (const child of node.children) {
      if (child.type === "import_spec_list") {
        for (const spec of child.children) {
          if (spec.type === "import_spec") {
            const info = this.extractGoImportSpec(spec, node.startPosition.row + 1);
            if (info) imports.push(info);
          }
        }
      } else if (child.type === "import_spec") {
        const info = this.extractGoImportSpec(child, node.startPosition.row + 1);
        if (info) imports.push(info);
      }
    }

    return imports;
  }

  private extractGoImportSpec(spec: Parser.SyntaxNode, _baseLine: number): ImportInfo | null {
    let source = "";
    let alias: string | undefined;
    const bindings: ImportBinding[] = [];

    for (const child of spec.children) {
      if (child.type === "interpreted_string_literal") {
        source = child.text.slice(1, -1);
      }
      if (child.type === "package_identifier" || child.type === "identifier") {
        alias = child.text;
      }
      if (child.type === "blank_identifier") {
        alias = "_";
      }
      if (child.type === "dot") {
        alias = ".";
      }
    }

    if (!source) return null;

    // Package name from path
    const pkgName = source.split("/").pop() || source;
    bindings.push({ name: alias || pkgName, originalName: alias ? pkgName : undefined });

    return {
      source,
      type: alias === "_" ? "side_effect" : alias === "." ? "namespace" : "named",
      bindings,
      line: spec.startPosition.row + 1,
      raw: spec.text,
    };
  }

  /**
   * Extract Rust use declaration.
   */
  private extractRustImport(node: Parser.SyntaxNode): ImportInfo | null {
    const bindings: ImportBinding[] = [];
    let source = "";

    // Find the use tree
    const useTree = node.children.find((c) => c.type === "use_tree");
    if (!useTree) return null;

    this.extractRustUseTree(useTree, "", bindings);
    source = bindings.length > 0 ? bindings[0].originalName || bindings[0].name : "";

    // Get base path from the tree
    const scopedIdent = useTree.children.find((c) => c.type === "scoped_identifier");
    if (scopedIdent) {
      source = scopedIdent.text;
    } else {
      const ident = useTree.children.find((c) => c.type === "identifier" || c.type === "crate");
      if (ident) source = ident.text;
    }

    return {
      source,
      type: "named",
      bindings,
      line: node.startPosition.row + 1,
      raw: node.text,
    };
  }

  private extractRustUseTree(node: Parser.SyntaxNode, _prefix: string, bindings: ImportBinding[]): void {
    for (const child of node.children) {
      if (child.type === "identifier" || child.type === "crate" || child.type === "self") {
        bindings.push({ name: child.text });
      }
      if (child.type === "scoped_identifier") {
        bindings.push({ name: child.text });
      }
      if (child.type === "use_as_clause") {
        const orig = child.children.find((c) => c.type === "identifier" && c === child.children[0]);
        const alias = child.children.find((c) => c.type === "identifier" && c !== child.children[0]);
        if (orig && alias) {
          bindings.push({ name: alias.text, originalName: orig.text });
        } else if (orig) {
          bindings.push({ name: orig.text });
        }
      }
      if (child.type === "use_list") {
        for (const item of child.children) {
          if (item.type === "identifier") {
            bindings.push({ name: item.text });
          }
          if (item.type === "use_as_clause") {
            const orig = item.children[0];
            const alias = item.children.find((c) => c.type === "identifier" && c !== orig);
            bindings.push({
              name: alias?.text || orig.text,
              originalName: alias ? orig.text : undefined,
            });
          }
        }
      }
      if (child.type === "use_wildcard") {
        bindings.push({ name: "*" });
      }
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
      this.findExportStatements(tree.rootNode, lang.id, exports);

      return Ok(exports);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Recursively find all export statements in a node.
   */
  private findExportStatements(
    node: Parser.SyntaxNode,
    language: string,
    exports: ExportInfo[]
  ): void {
    // TypeScript/JavaScript exports
    if (language === "typescript" || language === "javascript") {
      if (node.type === "export_statement") {
        const info = this.extractTsExport(node);
        if (info) exports.push(info);
      }
    }

    // Python exports (module-level assignments and __all__)
    if (language === "python") {
      // Python doesn't have explicit exports - skip for now
      // Could potentially look at __all__ in the future
    }

    // Go exports (capitalized identifiers are public)
    if (language === "go") {
      // Go doesn't have export statements - public symbols are capitalized
      // Already handled by list_symbols
    }

    // Rust exports (pub keyword)
    if (language === "rust") {
      // Handled by looking for pub visibility on declarations
      // Skip explicit export tracking for now
    }

    // Recurse into children
    for (const child of node.children) {
      this.findExportStatements(child, language, exports);
    }
  }

  /**
   * Extract TypeScript/JavaScript export.
   */
  private extractTsExport(node: Parser.SyntaxNode): ExportInfo | null {
    const bindings: ExportBinding[] = [];
    let exportType: ExportType = "named";
    let source: string | undefined;
    let isTypeOnly = false;
    let isDefault = false;

    // First pass: detect modifiers and source
    for (const child of node.children) {
      if (child.type === "type") {
        isTypeOnly = true;
      }
      if (child.type === "default") {
        isDefault = true;
        exportType = "default";
      }
      if (child.type === "string") {
        source = child.text.slice(1, -1);
      }
    }

    // Second pass: extract bindings based on export type
    for (const child of node.children) {
      // Default export: export default foo
      if (isDefault) {
        if (child.type === "identifier") {
          bindings.push({ name: "default", localName: child.text });
          break; // Only one default
        }
        if (child.type === "function_declaration" || child.type === "class_declaration") {
          const nameNode = child.children.find((c) => c.type === "identifier" || c.type === "type_identifier");
          bindings.push({
            name: "default",
            localName: nameNode?.text,
            kind: child.type === "function_declaration" ? "function" : "class",
          });
          break;
        }
        if (child.type === "object" || child.type === "arrow_function" || child.type === "call_expression") {
          bindings.push({ name: "default" });
          break;
        }
        continue; // Skip other nodes for default exports
      }

      // Export clause: export { foo, bar }
      if (child.type === "export_clause") {
        for (const spec of child.children) {
          if (spec.type === "export_specifier") {
            const names = spec.children.filter((c) => c.type === "identifier");
            if (names.length === 2) {
              // Aliased: export { foo as bar }
              bindings.push({
                name: names[1].text,
                localName: names[0].text,
                isType: isTypeOnly,
              });
            } else if (names.length === 1) {
              bindings.push({ name: names[0].text, isType: isTypeOnly });
            }
          }
        }
      }

      // Namespace export: export * from "module"
      if (child.type === "*") {
        exportType = "namespace";
        bindings.push({ name: "*" });
      }

      // Namespace export with alias: export * as foo from "module"
      if (child.type === "namespace_export") {
        exportType = "namespace";
        const alias = child.children.find((c) => c.type === "identifier");
        bindings.push({ name: alias?.text || "*", localName: "*" });
      }

      // Declaration exports: export function foo() {}, export class Bar {}
      if (
        child.type === "function_declaration" ||
        child.type === "class_declaration" ||
        child.type === "interface_declaration" ||
        child.type === "type_alias_declaration" ||
        child.type === "enum_declaration"
      ) {
        exportType = "declaration";
        const nameNode = child.children.find((c) =>
          c.type === "identifier" || c.type === "type_identifier"
        );
        if (nameNode) {
          bindings.push({
            name: nameNode.text,
            kind: this.nodeTypeToSymbolKind(child.type),
            isType: isTypeOnly,
          });
        }
      }

      // Variable exports: export const foo = 1
      if (child.type === "lexical_declaration" || child.type === "variable_declaration") {
        exportType = "declaration";
        for (const decl of child.children) {
          if (decl.type === "variable_declarator") {
            const nameNode = decl.children.find((c) => c.type === "identifier");
            if (nameNode) {
              bindings.push({ name: nameNode.text, kind: "variable" });
            }
          }
        }
      }
    }

    // Handle default exports without explicit bindings
    if (isDefault && bindings.length === 0) {
      bindings.push({ name: "default" });
    }

    // Determine if it's a re-export
    if (source && !isDefault) {
      exportType = exportType === "namespace" ? "namespace" : "reexport";
    }

    // Skip empty exports
    if (bindings.length === 0) return null;

    return {
      type: exportType,
      bindings,
      source,
      line: node.startPosition.row + 1,
      raw: node.text,
    };
  }

  /**
   * Map tree-sitter node type to SymbolKind.
   */
  private nodeTypeToSymbolKind(nodeType: string): SymbolKind | undefined {
    const mapping: Record<string, SymbolKind> = {
      function_declaration: "function",
      class_declaration: "class",
      interface_declaration: "interface",
      type_alias_declaration: "type_alias",
      enum_declaration: "enum",
      lexical_declaration: "variable",
      variable_declaration: "variable",
    };
    return mapping[nodeType];
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

  private extractSymbols(node: Parser.SyntaxNode, source: string, language: string): Symbol[] {
    const symbols: Symbol[] = [];
    let precedingComment: Parser.SyntaxNode | undefined;

    for (const child of node.children) {
      // Track comment nodes to associate with the next symbol
      if (child.type === "comment") {
        // Only keep doc comments (JSDoc style /** or Python docstrings)
        if (this.isDocComment(child.text, language)) {
          precedingComment = child;
        }
        continue;
      }

      // Handle export statements - look inside for the actual declaration
      const targetNode = this.unwrapExport(child, language);
      const symbol = this.nodeToSymbol(targetNode, source, language, precedingComment);
      if (symbol) {
        symbols.push(symbol);
      }

      // Reset after processing a non-comment node
      precedingComment = undefined;
    }

    return symbols;
  }

  /**
   * Unwrap export statements to get the inner declaration.
   * TypeScript/JavaScript: export_statement wraps class_declaration, function_declaration, etc.
   */
  private unwrapExport(node: Parser.SyntaxNode, language: string): Parser.SyntaxNode {
    if (language !== "typescript" && language !== "javascript") {
      return node;
    }

    if (node.type === "export_statement") {
      // Find the actual declaration inside the export
      for (const child of node.children) {
        if (
          child.type === "class_declaration" ||
          child.type === "function_declaration" ||
          child.type === "interface_declaration" ||
          child.type === "type_alias_declaration" ||
          child.type === "enum_declaration" ||
          child.type === "lexical_declaration" ||
          child.type === "variable_declaration"
        ) {
          return child;
        }
      }
    }

    return node;
  }

  private nodeToSymbol(
    node: Parser.SyntaxNode,
    source: string,
    language: string,
    precedingComment?: Parser.SyntaxNode
  ): Symbol | null {
    const kind = this.getSymbolKind(node.type, language);
    if (!kind) return null;

    const name = this.getSymbolName(node, language);
    if (!name) return null;

    const span = this.nodeToSpan(node);
    const bodySpan = this.getBodySpan(node, language);
    const children = this.extractChildSymbols(node, source, language);

    // Extract documentation - for Python, check docstrings inside the body
    let documentation: string | undefined;
    if (language === "python") {
      documentation = this.extractPythonDocstring(node);
    } else {
      documentation = this.extractDocumentation(precedingComment, language);
    }

    return {
      name,
      kind,
      span,
      bodySpan,
      children,
      ...(documentation && { documentation }),
    };
  }

  private extractChildSymbols(node: Parser.SyntaxNode, source: string, language: string): Symbol[] {
    // Only extract children from container types (classes, interfaces, modules)
    // Skip function/method bodies to avoid capturing local variables as symbols
    const containerNodeTypes = new Set([
      // TypeScript/JavaScript
      "class_declaration",
      "class",
      "interface_declaration",
      "namespace_declaration",
      "module",
      "enum_declaration",
      // Python
      "class_definition",
      // Go
      "type_declaration",
      // Rust
      "struct_item",
      "trait_item",
      "impl_item",
      "enum_item",
      "mod_item",
    ]);

    if (!containerNodeTypes.has(node.type)) {
      return [];
    }

    const symbols: Symbol[] = [];
    let precedingComment: Parser.SyntaxNode | undefined;

    // Find the body node for classes
    const bodyNode = this.findBodyNode(node, language);
    const searchNode = bodyNode ?? node;

    for (const child of searchNode.children) {
      // Track comment nodes
      if (child.type === "comment") {
        if (this.isDocComment(child.text, language)) {
          precedingComment = child;
        }
        continue;
      }

      const symbol = this.nodeToSymbol(child, source, language, precedingComment);
      if (symbol) {
        symbols.push(symbol);
      }

      precedingComment = undefined;
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

  private getSymbolName(node: Parser.SyntaxNode, _language: string): string | null {
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

  /**
   * Check if a comment is a documentation comment.
   */
  private isDocComment(text: string, language: string): boolean {
    if (language === "typescript" || language === "javascript") {
      // JSDoc style: /** ... */
      return text.startsWith("/**") && !text.startsWith("/***");
    }
    if (language === "python") {
      // Python docstrings are triple-quoted strings, handled differently
      // For now, look for # style doc comments or triple quotes
      return text.startsWith('"""') || text.startsWith("'''");
    }
    if (language === "rust") {
      // Rust doc comments: /// or //!
      return text.startsWith("///") || text.startsWith("//!");
    }
    if (language === "go") {
      // Go doc comments start with // and precede declarations
      return text.startsWith("//");
    }
    return false;
  }

  /**
   * Extract documentation from a comment node.
   */
  private extractDocumentation(
    commentNode: Parser.SyntaxNode | undefined,
    language: string
  ): string | undefined {
    if (!commentNode) return undefined;

    const text = commentNode.text;

    if (language === "typescript" || language === "javascript") {
      // Parse JSDoc: remove /** and */, clean up * prefixes
      return this.parseJSDoc(text);
    }
    if (language === "python") {
      // Remove triple quotes
      return text.replace(/^['\"]{3}|['\"]{3}$/g, "").trim();
    }
    if (language === "rust") {
      // Remove /// or //! prefix from each line
      return text
        .split("\n")
        .map((line) => line.replace(/^\s*\/\/[\/!]\s?/, ""))
        .join("\n")
        .trim();
    }
    if (language === "go") {
      // Remove // prefix from each line
      return text
        .split("\n")
        .map((line) => line.replace(/^\s*\/\/\s?/, ""))
        .join("\n")
        .trim();
    }

    return text;
  }

  /**
   * Extract Python docstring from inside a function/class body.
   * Docstrings are the first statement as a string literal.
   */
  private extractPythonDocstring(node: Parser.SyntaxNode): string | undefined {
    // Find the block node
    const block = node.children.find((c) => c.type === "block");
    if (!block) return undefined;

    // The first statement in the block might be the docstring
    const firstStatement = block.children.find((c) => c.type === "expression_statement");
    if (!firstStatement) return undefined;

    // Check if it's a string (docstring)
    const stringNode = firstStatement.children.find((c) => c.type === "string");
    if (!stringNode) return undefined;

    // Extract the string content, removing quotes
    let text = stringNode.text;
    // Remove triple quotes (""" or ''')
    if (text.startsWith('"""') || text.startsWith("'''")) {
      text = text.slice(3, -3);
    } else if (text.startsWith('"') || text.startsWith("'")) {
      text = text.slice(1, -1);
    }

    return text.trim();
  }

  /**
   * Parse JSDoc comment and return clean documentation.
   */
  private parseJSDoc(text: string): string {
    // Remove /** and */
    let doc = text.replace(/^\/\*\*\s*/, "").replace(/\s*\*\/$/, "");

    // Split into lines and remove leading * from each line
    const lines = doc.split("\n").map((line) => {
      return line.replace(/^\s*\*\s?/, "");
    });

    return lines.join("\n").trim();
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

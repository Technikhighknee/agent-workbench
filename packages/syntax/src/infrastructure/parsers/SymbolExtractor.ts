/**
 * Symbol extraction from parsed AST nodes.
 * Extracts classes, functions, interfaces, etc. from source code.
 */
import type Parser from "tree-sitter";
import type { Symbol, SymbolKind, Span } from "../../core/model.js";
import type { ParseError } from "../../core/ports/Parser.js";

/**
 * Extract all top-level symbols from a syntax tree.
 */
export function extractSymbols(
  node: Parser.SyntaxNode,
  source: string,
  language: string
): Symbol[] {
  const symbols: Symbol[] = [];
  let precedingComment: Parser.SyntaxNode | undefined;

  for (const child of node.children) {
    // Track comment nodes to associate with the next symbol
    if (child.type === "comment") {
      // Only keep doc comments (JSDoc style /** or Python docstrings)
      if (isDocComment(child.text, language)) {
        precedingComment = child;
      }
      continue;
    }

    // Handle export statements - look inside for the actual declaration
    const targetNode = unwrapExport(child, language);
    const symbol = nodeToSymbol(targetNode, source, language, precedingComment);
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
export function unwrapExport(node: Parser.SyntaxNode, language: string): Parser.SyntaxNode {
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

/**
 * Convert an AST node to a Symbol.
 */
export function nodeToSymbol(
  node: Parser.SyntaxNode,
  source: string,
  language: string,
  precedingComment?: Parser.SyntaxNode
): Symbol | null {
  const kind = getSymbolKind(node.type, language, node);
  if (!kind) return null;

  const name = getSymbolName(node, language);
  if (!name) return null;

  const span = nodeToSpan(node);
  const bodySpan = getBodySpan(node, language);
  const children = extractChildSymbols(node, source, language);

  // Extract documentation - for Python, check docstrings inside the body
  let documentation: string | undefined;
  if (language === "python") {
    documentation = extractPythonDocstring(node);
  } else {
    documentation = extractDocumentation(precedingComment, language);
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

/**
 * Extract child symbols from container types.
 */
export function extractChildSymbols(
  node: Parser.SyntaxNode,
  source: string,
  language: string
): Symbol[] {
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
  const bodyNode = findBodyNode(node, language);
  const searchNode = bodyNode ?? node;

  for (const child of searchNode.children) {
    // Track comment nodes
    if (child.type === "comment") {
      if (isDocComment(child.text, language)) {
        precedingComment = child;
      }
      continue;
    }

    const symbol = nodeToSymbol(child, source, language, precedingComment);
    if (symbol) {
      symbols.push(symbol);
    }

    precedingComment = undefined;
  }

  return symbols;
}

/**
 * Find the body node for container types.
 */
export function findBodyNode(node: Parser.SyntaxNode, language: string): Parser.SyntaxNode | null {
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

/**
 * Determine the SymbolKind from an AST node type.
 */
export function getSymbolKind(
  nodeType: string,
  language: string,
  node?: Parser.SyntaxNode
): SymbolKind | null {
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
      case "decorated_definition":
        // Look inside to find the decorated function or class
        if (node) {
          const inner = node.children.find(
            (c) => c.type === "function_definition" || c.type === "class_definition"
          );
          if (inner?.type === "class_definition") return "class";
          if (inner?.type === "function_definition") return "function";
        }
        return "function"; // Default to function for decorated items
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
        // Check if it's a struct or interface type
        return node ? getGoTypeKind(node) : "type_alias";
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

/**
 * Determine the kind for a Go type_declaration.
 */
function getGoTypeKind(node: Parser.SyntaxNode): SymbolKind {
  const typeSpec = node.children.find((c) => c.type === "type_spec");
  if (typeSpec) {
    for (const child of typeSpec.children) {
      if (child.type === "struct_type") return "class";
      if (child.type === "interface_type") return "interface";
    }
  }
  return "type_alias";
}

/**
 * Extract the symbol name from an AST node.
 */
export function getSymbolName(node: Parser.SyntaxNode, language: string): string | null {
  // Go methods: method_declaration has field_identifier for the method name
  if (language === "go" && node.type === "method_declaration") {
    const fieldIdent = node.children.find((c) => c.type === "field_identifier");
    if (fieldIdent) return fieldIdent.text;
  }

  // Go type declarations: look for type_spec with type_identifier
  if (language === "go" && node.type === "type_declaration") {
    const typeSpec = node.children.find((c) => c.type === "type_spec");
    if (typeSpec) {
      const typeName = typeSpec.children.find((c) => c.type === "type_identifier");
      if (typeName) return typeName.text;
    }
  }

  // Python decorated definitions: look inside for the function/class name
  if (language === "python" && node.type === "decorated_definition") {
    const inner = node.children.find(
      (c) => c.type === "function_definition" || c.type === "class_definition"
    );
    if (inner) {
      const nameNode = inner.children.find((c) => c.type === "identifier");
      if (nameNode) return nameNode.text;
    }
  }

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

/**
 * Convert an AST node to a Span.
 */
export function nodeToSpan(node: Parser.SyntaxNode): Span {
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

/**
 * Get the body span for container types.
 */
export function getBodySpan(node: Parser.SyntaxNode, language: string): Span | undefined {
  const bodyNode = findBodyNode(node, language);
  if (!bodyNode) return undefined;
  return nodeToSpan(bodyNode);
}

/**
 * Check if a comment is a documentation comment.
 */
export function isDocComment(text: string, language: string): boolean {
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
export function extractDocumentation(
  commentNode: Parser.SyntaxNode | undefined,
  language: string
): string | undefined {
  if (!commentNode) return undefined;

  const text = commentNode.text;

  if (language === "typescript" || language === "javascript") {
    // Parse JSDoc: remove /** and */, clean up * prefixes
    return parseJSDoc(text);
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
 */
export function extractPythonDocstring(node: Parser.SyntaxNode): string | undefined {
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
export function parseJSDoc(text: string): string {
  // Remove /** and */
  let doc = text.replace(/^\/\*\*\s*/, "").replace(/\s*\*\/$/, "");

  // Split into lines and remove leading * from each line
  const lines = doc.split("\n").map((line) => {
    return line.replace(/^\s*\*\s?/, "");
  });

  return lines.join("\n").trim();
}

/**
 * Extract parse errors from a syntax tree.
 */
export function extractErrors(node: Parser.SyntaxNode): ParseError[] {
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

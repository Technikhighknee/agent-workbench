/**
 * Export statement extraction for TypeScript/JavaScript.
 * Extracts export information from parsed AST nodes.
 */
import type Parser from "tree-sitter";

import type { ExportBinding, ExportInfo, ExportType, SymbolKind } from "../../core/model.js";

/**
 * Find all export statements in a node tree.
 */
export function findExportStatements(
  node: Parser.SyntaxNode,
  language: string,
  exports: ExportInfo[]
): void {
  // TypeScript/JavaScript exports
  if (language === "typescript" || language === "javascript") {
    if (node.type === "export_statement") {
      const info = extractTsExport(node);
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
    findExportStatements(child, language, exports);
  }
}

/**
 * Extract TypeScript/JavaScript export.
 */
export function extractTsExport(node: Parser.SyntaxNode): ExportInfo | null {
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
          kind: nodeTypeToSymbolKind(child.type),
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
export function nodeTypeToSymbolKind(nodeType: string): SymbolKind | undefined {
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

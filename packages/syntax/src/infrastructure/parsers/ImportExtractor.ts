/**
 * Import statement extraction for all supported languages.
 * Extracts import information from parsed AST nodes.
 */
import type Parser from "tree-sitter";

import type { ImportBinding, ImportInfo, ImportType } from "../../core/model.js";

/**
 * Find all import statements in a node tree.
 */
export function findImportStatements(
  node: Parser.SyntaxNode,
  language: string,
  imports: ImportInfo[]
): void {
  // TypeScript/JavaScript imports
  if (language === "typescript" || language === "javascript") {
    if (node.type === "import_statement") {
      const info = extractTsImport(node);
      if (info) imports.push(info);
    }
  }

  // Python imports
  if (language === "python") {
    if (node.type === "import_statement" || node.type === "import_from_statement") {
      const info = extractPyImport(node);
      if (info) imports.push(info);
    }
  }

  // Go imports
  if (language === "go") {
    if (node.type === "import_declaration") {
      const infos = extractGoImports(node);
      imports.push(...infos);
    }
  }

  // Rust imports
  if (language === "rust") {
    if (node.type === "use_declaration") {
      const info = extractRustImport(node);
      if (info) imports.push(info);
    }
  }

  // Recurse into children
  for (const child of node.children) {
    findImportStatements(child, language, imports);
  }
}

/**
 * Extract TypeScript/JavaScript import.
 */
export function extractTsImport(node: Parser.SyntaxNode): ImportInfo | null {
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
export function extractPyImport(node: Parser.SyntaxNode): ImportInfo | null {
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
export function extractGoImports(node: Parser.SyntaxNode): ImportInfo[] {
  const imports: ImportInfo[] = [];

  for (const child of node.children) {
    if (child.type === "import_spec_list") {
      for (const spec of child.children) {
        if (spec.type === "import_spec") {
          const info = extractGoImportSpec(spec);
          if (info) imports.push(info);
        }
      }
    } else if (child.type === "import_spec") {
      const info = extractGoImportSpec(child);
      if (info) imports.push(info);
    }
  }

  return imports;
}

function extractGoImportSpec(spec: Parser.SyntaxNode): ImportInfo | null {
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
export function extractRustImport(node: Parser.SyntaxNode): ImportInfo | null {
  const bindings: ImportBinding[] = [];
  let source = "";

  // Find the use tree
  const useTree = node.children.find((c) => c.type === "use_tree");
  if (!useTree) return null;

  extractRustUseTree(useTree, bindings);
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

function extractRustUseTree(node: Parser.SyntaxNode, bindings: ImportBinding[]): void {
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

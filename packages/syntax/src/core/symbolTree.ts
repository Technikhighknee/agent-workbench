import { Location, Symbol, SymbolInfo } from "./model.js";

/**
 * Represents the parsed symbol structure of a source file.
 */
export interface SymbolTree {
  filePath: string;
  language: string;
  symbols: Symbol[];
}

/**
 * Find a symbol by its name path (e.g., "MyClass/myMethod").
 *
 * @param tree - The symbol tree to search
 * @param namePath - Path like "MyClass/myMethod" or just "myFunction"
 * @returns The symbol if found, undefined otherwise
 */
export function findByNamePath(tree: SymbolTree, namePath: string): Symbol | undefined {
  const parts = namePath.split("/").filter(Boolean);
  if (parts.length === 0) return undefined;

  let current: Symbol[] = tree.symbols;
  let found: Symbol | undefined;

  for (const part of parts) {
    found = current.find((s) => s.name === part);
    if (!found) return undefined;
    current = found.children;
  }

  return found;
}

/**
 * Find a symbol at a specific location.
 * Returns the most specific (deepest) symbol containing the location.
 */
export function findAtLocation(tree: SymbolTree, location: Location): Symbol | undefined {
  function searchSymbols(symbols: Symbol[]): Symbol | undefined {
    for (const symbol of symbols) {
      if (containsLocation(symbol.span, location)) {
        // Check children first for more specific match
        const childMatch = searchSymbols(symbol.children);
        return childMatch ?? symbol;
      }
    }
    return undefined;
  }

  return searchSymbols(tree.symbols);
}

function containsLocation(span: { start: Location; end: Location }, loc: Location): boolean {
  if (loc.line < span.start.line || loc.line > span.end.line) {
    return false;
  }
  if (loc.line === span.start.line && loc.column < span.start.column) {
    return false;
  }
  if (loc.line === span.end.line && loc.column > span.end.column) {
    return false;
  }
  return true;
}

/**
 * Convert a Symbol to a simplified SymbolInfo.
 */
export function toSymbolInfo(symbol: Symbol, parentPath = ""): SymbolInfo {
  const namePath = parentPath ? `${parentPath}/${symbol.name}` : symbol.name;

  return {
    name: symbol.name,
    namePath,
    kind: symbol.kind,
    line: symbol.span.start.line,
    endLine: symbol.span.end.line,
    children: symbol.children.length > 0
      ? symbol.children.map((c) => toSymbolInfo(c, namePath))
      : undefined,
  };
}

/**
 * Convert entire tree to SymbolInfo array.
 */
export function toSymbolInfoList(tree: SymbolTree): SymbolInfo[] {
  return tree.symbols.map((s) => toSymbolInfo(s));
}

/**
 * Flatten all symbols in the tree to a single array with name paths.
 */
export function flattenSymbols(tree: SymbolTree): Array<{ symbol: Symbol; namePath: string }> {
  const result: Array<{ symbol: Symbol; namePath: string }> = [];

  function flatten(symbols: Symbol[], parentPath: string): void {
    for (const symbol of symbols) {
      const namePath = parentPath ? `${parentPath}/${symbol.name}` : symbol.name;
      result.push({ symbol, namePath });
      flatten(symbol.children, namePath);
    }
  }

  flatten(tree.symbols, "");
  return result;
}

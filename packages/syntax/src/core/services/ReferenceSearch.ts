/**
 * Reference Search - Find symbol references across indexed files.
 */

import { Err, Ok, Result } from "@agent-workbench/core";

import { escapeRegex } from "../model.js";
import type { IndexedSymbol, SymbolReference } from "../model.js";
import type { FileSystem } from "../ports/FileSystem.js";

export interface ReferenceSearchContext {
  indexedFiles: Map<string, unknown>;
  allSymbols: IndexedSymbol[];
  fs: FileSystem;
  resolvePath: (relativePath: string) => string;
}

/**
 * Check if a location is a symbol definition.
 */
function isDefinitionLocation(
  ctx: ReferenceSearchContext,
  filePath: string,
  symbolName: string,
  line: number
): boolean {
  const symbol = ctx.allSymbols.find(
    (s) =>
      s.filePath === filePath &&
      s.name === symbolName &&
      s.line <= line &&
      s.endLine >= line
  );
  return symbol !== undefined && symbol.line === line;
}

/**
 * Find all references to a symbol across indexed files.
 * Uses text-based search for the symbol name as an identifier.
 */
export function findReferences(
  ctx: ReferenceSearchContext,
  symbolName: string,
  _definitionFile?: string
): Result<SymbolReference[], string> {
  if (ctx.indexedFiles.size === 0) {
    return Err("No project indexed. Call index first.");
  }

  const references: SymbolReference[] = [];
  const pattern = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, "g");

  for (const [relativePath] of ctx.indexedFiles) {
    const fullPath = ctx.resolvePath(relativePath);
    const sourceResult = ctx.fs.read(fullPath);

    if (!sourceResult.ok) continue;

    const source = sourceResult.value;
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpExecArray | null;

      pattern.lastIndex = 0;

      while ((match = pattern.exec(line)) !== null) {
        const lineNum = i + 1;
        const column = match.index + 1;

        const isDefinition = isDefinitionLocation(
          ctx,
          relativePath,
          symbolName,
          lineNum
        );

        references.push({
          filePath: relativePath,
          symbolName,
          line: lineNum,
          column,
          context: line.trim(),
          isDefinition,
        });
      }
    }
  }

  // Sort: definitions first, then by file and line
  references.sort((a, b) => {
    if (a.isDefinition !== b.isDefinition) {
      return a.isDefinition ? -1 : 1;
    }
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    return a.line - b.line;
  });

  return Ok(references);
}

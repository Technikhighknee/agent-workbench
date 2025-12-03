/**
 * Symbol diff analysis - extracted from GitService for better separation of concerns.
 * Analyzes symbol changes between two versions of files.
 */

import {
  type Result,
  ok,
  err,
  type ChangedSymbol,
  type ChangedSymbolsResult,
} from "./model.js";
import {
  TreeSitterParser,
  flattenSymbols,
  detectLanguage,
} from "@agent-workbench/syntax";

/**
 * Represents a changed file with its status.
 */
interface ChangedFile {
  path: string;
  status: string; // A, M, D, R, etc.
  oldPath?: string;
}

/**
 * Dependencies required for symbol diff analysis.
 */
export interface SymbolDiffDeps {
  getFileAtRef: (ref: string, filePath: string) => Promise<Result<string, string>>;
}

/**
 * Analyze symbol changes between two git refs.
 *
 * @param changedFiles - List of changed files from git diff
 * @param fromRef - Source git ref
 * @param toRef - Target git ref
 * @param deps - Dependencies for file access
 */
export async function analyzeChangedSymbols(
  changedFiles: ChangedFile[],
  fromRef: string,
  toRef: string,
  deps: SymbolDiffDeps
): Promise<ChangedSymbolsResult> {
  const parser = new TreeSitterParser();
  const supportedLanguages = new Set(parser.supportedLanguages());

  const added: ChangedSymbol[] = [];
  const modified: ChangedSymbol[] = [];
  const deleted: ChangedSymbol[] = [];
  const parseErrors: string[] = [];
  let filesAnalyzed = 0;

  // Filter to supported languages
  const supportedFiles = changedFiles.filter((file) => {
    const lang = detectLanguage(file.path);
    return lang && supportedLanguages.has(lang.id);
  });

  // Process each changed file
  for (const file of supportedFiles) {
    filesAnalyzed++;

    try {
      if (file.status === "A") {
        // Added file - all symbols are new
        const result = await analyzeAddedFile(file.path, toRef, parser, deps);
        if (result.ok) {
          added.push(...result.value);
        } else {
          parseErrors.push(file.path);
        }
      } else if (file.status === "D") {
        // Deleted file - all symbols are deleted
        const result = await analyzeDeletedFile(file.path, fromRef, parser, deps);
        if (result.ok) {
          deleted.push(...result.value);
        } else {
          parseErrors.push(file.path);
        }
      } else {
        // Modified file - compare symbols
        const result = await analyzeModifiedFile(
          file.path,
          file.oldPath,
          fromRef,
          toRef,
          parser,
          deps
        );
        if (result.ok) {
          added.push(...result.value.added);
          modified.push(...result.value.modified);
          deleted.push(...result.value.deleted);
        } else {
          parseErrors.push(file.path);
        }
      }
    } catch {
      parseErrors.push(file.path);
    }
  }

  return {
    fromRef,
    toRef,
    added,
    modified,
    deleted,
    filesAnalyzed,
    parseErrors,
  };
}

/**
 * Analyze symbols in an added file.
 */
async function analyzeAddedFile(
  filePath: string,
  ref: string,
  parser: TreeSitterParser,
  deps: SymbolDiffDeps
): Promise<Result<ChangedSymbol[], string>> {
  const content = await deps.getFileAtRef(ref, filePath);
  if (!content.ok) return err(content.error);

  const parseResult = await parser.parse(content.value, filePath);
  if (!parseResult.ok) return err("Parse failed");

  const symbols = flattenSymbols(parseResult.value.tree);
  return ok(
    symbols.map(({ symbol, namePath }) => ({
      name: symbol.name,
      qualifiedName: namePath,
      kind: symbol.kind,
      file: filePath,
      line: symbol.span.start.line,
      changeType: "added" as const,
    }))
  );
}

/**
 * Analyze symbols in a deleted file.
 */
async function analyzeDeletedFile(
  filePath: string,
  ref: string,
  parser: TreeSitterParser,
  deps: SymbolDiffDeps
): Promise<Result<ChangedSymbol[], string>> {
  const content = await deps.getFileAtRef(ref, filePath);
  if (!content.ok) return err(content.error);

  const parseResult = await parser.parse(content.value, filePath);
  if (!parseResult.ok) return err("Parse failed");

  const symbols = flattenSymbols(parseResult.value.tree);
  return ok(
    symbols.map(({ symbol, namePath }) => ({
      name: symbol.name,
      qualifiedName: namePath,
      kind: symbol.kind,
      file: filePath,
      line: symbol.span.start.line,
      changeType: "deleted" as const,
    }))
  );
}

/**
 * Analyze symbols in a modified file.
 */
async function analyzeModifiedFile(
  filePath: string,
  oldPath: string | undefined,
  fromRef: string,
  toRef: string,
  parser: TreeSitterParser,
  deps: SymbolDiffDeps
): Promise<Result<{ added: ChangedSymbol[]; modified: ChangedSymbol[]; deleted: ChangedSymbol[] }, string>> {
  const [oldContent, newContent] = await Promise.all([
    deps.getFileAtRef(fromRef, oldPath || filePath),
    deps.getFileAtRef(toRef, filePath),
  ]);

  if (!oldContent.ok || !newContent.ok) {
    return err("Failed to get file contents");
  }

  const [oldParse, newParse] = await Promise.all([
    parser.parse(oldContent.value, filePath),
    parser.parse(newContent.value, filePath),
  ]);

  if (!oldParse.ok || !newParse.ok) {
    return err("Parse failed");
  }

  const oldSymbols = flattenSymbols(oldParse.value.tree);
  const newSymbols = flattenSymbols(newParse.value.tree);

  // Build maps for comparison
  const oldMap = new Map(
    oldSymbols.map(({ symbol, namePath }) => [
      namePath,
      { symbol, body: oldContent.value.slice(symbol.span.start.offset, symbol.span.end.offset) },
    ])
  );
  const newMap = new Map(
    newSymbols.map(({ symbol, namePath }) => [
      namePath,
      { symbol, body: newContent.value.slice(symbol.span.start.offset, symbol.span.end.offset) },
    ])
  );

  const added: ChangedSymbol[] = [];
  const modified: ChangedSymbol[] = [];
  const deleted: ChangedSymbol[] = [];

  // Find added symbols
  for (const { symbol, namePath } of newSymbols) {
    if (!oldMap.has(namePath)) {
      added.push({
        name: symbol.name,
        qualifiedName: namePath,
        kind: symbol.kind,
        file: filePath,
        line: symbol.span.start.line,
        changeType: "added",
      });
    }
  }

  // Find deleted and modified symbols
  for (const { symbol, namePath } of oldSymbols) {
    const newEntry = newMap.get(namePath);
    if (!newEntry) {
      deleted.push({
        name: symbol.name,
        qualifiedName: namePath,
        kind: symbol.kind,
        file: filePath,
        line: symbol.span.start.line,
        changeType: "deleted",
      });
    } else {
      // Compare bodies to detect modifications
      const oldBody = oldContent.value.slice(symbol.span.start.offset, symbol.span.end.offset);
      if (oldBody !== newEntry.body) {
        modified.push({
          name: symbol.name,
          qualifiedName: namePath,
          kind: symbol.kind,
          file: filePath,
          line: newEntry.symbol.span.start.line,
          changeType: "modified",
        });
      }
    }
  }

  return ok({ added, modified, deleted });
}

/**
 * Parse git diff output into changed files list.
 */
export function parseDiffOutput(diffOutput: string): ChangedFile[] {
  const changedFiles: ChangedFile[] = [];
  const lines = diffOutput.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length >= 2) {
      const status = parts[0];
      const filePath = parts[1];
      const oldPath = parts.length > 2 ? parts[1] : undefined;

      changedFiles.push({
        path: parts.length > 2 ? parts[2] : filePath,
        status: status[0], // A, M, D, R, etc.
        oldPath,
      });
    }
  }

  return changedFiles;
}

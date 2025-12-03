/**
 * Caller/Callee Search - Text-based call site analysis.
 */

import { Err, Ok, Result } from "@agent-workbench/core";

import type { CallSite } from "../model.js";
import type { FileSystem } from "../ports/FileSystem.js";
import { flattenSymbols, SymbolTree } from "../symbolTree.js";
import { escapeRegex } from "./ReferenceSearch.js";

export interface CallerCalleeContext {
  indexedFiles: Map<string, SymbolTree>;
  fs: FileSystem;
  resolvePath: (relativePath: string) => string;
  rootPath: string;
}

/** Patterns that indicate a function declaration rather than a call */
const DECLARATION_PATTERNS = [
  /\bfunction\s+$/,
  /\basync\s+function\s+$/,
  /\bclass\s+$/,
  /\binterface\s+$/,
  /\btype\s+$/,
  /\bconst\s+$/,
  /\blet\s+$/,
  /\bvar\s+$/,
  /\bexport\s+function\s+$/,
  /\bexport\s+async\s+function\s+$/,
  /\bexport\s+default\s+function\s+$/,
  /\bexport\s+class\s+$/,
  /\bexport\s+interface\s+$/,
  /\bexport\s+type\s+$/,
];

/** Keywords to skip when finding callees */
const SKIP_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "function", "return",
  "async", "await", "new", "typeof", "instanceof", "class", "interface",
  "type", "const", "let", "var", "export", "import"
]);

/**
 * Get all functions/methods that call the given symbol.
 */
export function getCallers(
  ctx: CallerCalleeContext,
  symbolName: string
): Result<CallSite[], string> {
  if (ctx.indexedFiles.size === 0) {
    return Err("No project indexed. Call index first.");
  }

  const callers: CallSite[] = [];

  for (const [relativePath, tree] of ctx.indexedFiles) {
    const fullPath = ctx.resolvePath(relativePath);
    const sourceResult = ctx.fs.read(fullPath);
    if (!sourceResult.ok) continue;

    const source = sourceResult.value;
    const lines = source.split("\n");

    const flattened = flattenSymbols(tree);
    const callableSymbols = flattened.filter(({ symbol }) =>
      symbol.kind === "function" || symbol.kind === "method"
    );

    for (const { symbol, namePath } of callableSymbols) {
      if (symbol.name === symbolName) continue;

      const startLine = symbol.span.start.line;
      const endLine = symbol.span.end.line;
      const body = lines.slice(startLine - 1, endLine).join("\n");

      const callPattern = new RegExp(
        `(?:^|[^\\w])${escapeRegex(symbolName)}\\s*\\(`,
        "gm"
      );

      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(body)) !== null) {
        const beforeMatch = body.slice(0, match.index + 1).trimEnd();
        const isDeclaration = DECLARATION_PATTERNS.some(pattern =>
          pattern.test(beforeMatch)
        );

        if (isDeclaration) continue;

        const beforeMatchFull = body.slice(0, match.index);
        const lineOffset = (beforeMatchFull.match(/\n/g) || []).length;
        const callLine = startLine + lineOffset;

        callers.push({
          filePath: relativePath,
          line: callLine,
          column: 1,
          fromSymbol: namePath,
          context: lines[callLine - 1]?.trim() || "",
        });
      }
    }
  }

  callers.sort((a, b) => {
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    return a.line - b.line;
  });

  return Ok(callers);
}

/**
 * Get all functions/methods called by the given symbol.
 */
export function getCallees(
  ctx: CallerCalleeContext,
  filePath: string,
  symbolNamePath: string
): Result<CallSite[], string> {
  if (ctx.indexedFiles.size === 0) {
    return Err("No project indexed. Call index first.");
  }

  const relativePath = filePath.startsWith(ctx.rootPath)
    ? filePath.slice(ctx.rootPath.length + 1)
    : filePath;

  const tree = ctx.indexedFiles.get(relativePath);
  if (!tree) {
    return Err(`File not indexed: ${filePath}`);
  }

  const flattened = flattenSymbols(tree);
  const symbolEntry = flattened.find(({ namePath }) => namePath === symbolNamePath);
  if (!symbolEntry) {
    return Err(`Symbol not found: ${symbolNamePath}`);
  }

  const { symbol } = symbolEntry;
  const fullPath = ctx.resolvePath(relativePath);
  const sourceResult = ctx.fs.read(fullPath);
  if (!sourceResult.ok) {
    return Err(sourceResult.error.message);
  }

  const source = sourceResult.value;
  const lines = source.split("\n");

  const startLine = symbol.span.start.line;
  const endLine = symbol.span.end.line;
  const bodyStartLine = startLine + 1;

  if (bodyStartLine > endLine) {
    return Ok([]);
  }

  const body = lines.slice(bodyStartLine - 1, endLine).join("\n");
  const callPattern = /(?:^|[^\w])(\w+)\s*\(/gm;
  const callees: CallSite[] = [];
  const seenCalls = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(body)) !== null) {
    const calleeName = match[1];

    if (SKIP_KEYWORDS.has(calleeName)) {
      continue;
    }

    if (calleeName === symbol.name) {
      const contextLine = lines[bodyStartLine - 1 + Math.floor(match.index / 100)]?.trim() || "";
      if (contextLine.startsWith("function ") || contextLine.startsWith("async function ")) {
        continue;
      }
    }

    const beforeMatch = body.slice(0, match.index);
    const lineOffset = (beforeMatch.match(/\n/g) || []).length;
    const callLine = bodyStartLine + lineOffset;

    const key = `${calleeName}:${callLine}`;
    if (seenCalls.has(key)) continue;
    seenCalls.add(key);

    callees.push({
      filePath: relativePath,
      line: callLine,
      column: 1,
      fromSymbol: calleeName,
      context: lines[callLine - 1]?.trim() || "",
    });
  }

  return Ok(callees);
}

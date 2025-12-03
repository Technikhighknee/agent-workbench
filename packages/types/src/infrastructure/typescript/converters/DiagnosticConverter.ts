/**
 * Diagnostic conversion utilities.
 * Converts TypeScript diagnostics to our domain model.
 */

import ts from "typescript";

import type {
  Diagnostic,
  DiagnosticCategory,
  DiagnosticSeverity,
  RelatedDiagnosticInfo,
} from "../../../core/model.js";
import type { TypeScriptLanguageServiceHost } from "../TypeScriptLanguageServiceHost.js";

export interface DiagnosticContext {
  host: TypeScriptLanguageServiceHost;
}

/**
 * Convert TypeScript diagnostic severity to our model.
 */
export function convertSeverity(category: ts.DiagnosticCategory): DiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Warning:
      return "warning";
    case ts.DiagnosticCategory.Suggestion:
      return "hint";
    case ts.DiagnosticCategory.Message:
      return "info";
    default:
      return "info";
  }
}

/**
 * Get line and column from a TypeScript diagnostic.
 */
export function getLineAndColumn(diag: ts.Diagnostic): {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
} {
  if (!diag.file || diag.start === undefined) {
    return { line: 1, column: 1, endLine: 1, endColumn: 1 };
  }

  const start = diag.file.getLineAndCharacterOfPosition(diag.start);
  const end = diag.file.getLineAndCharacterOfPosition(
    diag.start + (diag.length ?? 0)
  );

  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

/**
 * Convert related diagnostic info.
 */
export function convertRelatedInfo(
  info: ts.DiagnosticRelatedInformation,
  ctx: DiagnosticContext
): RelatedDiagnosticInfo {
  const file = info.file?.fileName ?? "unknown";
  let line = 1, column = 1;

  if (info.file && info.start !== undefined) {
    const pos = info.file.getLineAndCharacterOfPosition(info.start);
    line = pos.line + 1;
    column = pos.character + 1;
  }

  return {
    file: ctx.host.relativePath(file),
    line,
    column,
    message: ts.flattenDiagnosticMessageText(info.messageText, "\n"),
  };
}

/**
 * Convert a TypeScript diagnostic to our model.
 */
export function convertDiagnostic(
  diag: ts.Diagnostic,
  category: DiagnosticCategory,
  ctx: DiagnosticContext
): Diagnostic {
  const file = diag.file?.fileName ?? "unknown";
  const { line, column, endLine, endColumn } = getLineAndColumn(diag);

  return {
    file: ctx.host.relativePath(file),
    line,
    column,
    endLine,
    endColumn,
    message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
    code: `TS${diag.code}`,
    severity: convertSeverity(diag.category),
    category,
    source: "typescript",
    relatedInfo: diag.relatedInformation?.map((info) =>
      convertRelatedInfo(info, ctx)
    ),
  };
}

/**
 * Code action conversion utilities.
 * Converts TypeScript code actions to our domain model.
 */

import ts from "typescript";

import type { CodeAction, FileEdit, TextChange } from "../../../core/model.js";
import type { TypeScriptLanguageServiceHost } from "../TypeScriptLanguageServiceHost.js";

export interface CodeActionContext {
  host: TypeScriptLanguageServiceHost;
}

/**
 * Convert a TypeScript text change to our model.
 */
function convertTextChange(
  fileName: string,
  change: ts.TextChange,
  ctx: CodeActionContext
): TextChange {
  const sourceFile = ctx.host.getSourceFile(fileName);
  if (!sourceFile) {
    return {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
      newText: change.newText,
    };
  }

  const start = sourceFile.getLineAndCharacterOfPosition(change.span.start);
  const end = sourceFile.getLineAndCharacterOfPosition(
    change.span.start + change.span.length
  );

  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 },
    newText: change.newText,
  };
}

/**
 * Convert a TypeScript code fix action to our model.
 */
export function convertCodeAction(
  action: ts.CodeFixAction,
  ctx: CodeActionContext
): CodeAction {
  const edits: FileEdit[] = action.changes.map((change) => ({
    file: ctx.host.relativePath(change.fileName),
    changes: change.textChanges.map((tc) =>
      convertTextChange(change.fileName, tc, ctx)
    ),
  }));

  return {
    title: action.description,
    kind: "quickfix",
    isPreferred: action.fixId !== undefined,
    edits,
  };
}

/**
 * Definition and reference conversion utilities.
 * Converts TypeScript definitions/references to our domain model.
 */

import ts from "typescript";

import type { Definition, SymbolKind } from "../../../core/model.js";
import type { TypeScriptLanguageServiceHost } from "../TypeScriptLanguageServiceHost.js";

export interface DefinitionContext {
  host: TypeScriptLanguageServiceHost;
}

/**
 * Convert TypeScript ScriptElementKind to our SymbolKind.
 */
export function convertSymbolKind(kind: ts.ScriptElementKind): SymbolKind {
  switch (kind) {
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.constElement:
      return "variable";
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return "function";
    case ts.ScriptElementKind.classElement:
      return "class";
    case ts.ScriptElementKind.interfaceElement:
      return "interface";
    case ts.ScriptElementKind.typeElement:
      return "type";
    case ts.ScriptElementKind.enumElement:
      return "enum";
    case ts.ScriptElementKind.enumMemberElement:
      return "enum_member";
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return "property";
    case ts.ScriptElementKind.memberFunctionElement:
      return "method";
    case ts.ScriptElementKind.parameterElement:
      return "parameter";
    case ts.ScriptElementKind.typeParameterElement:
      return "type_parameter";
    case ts.ScriptElementKind.moduleElement:
      return "module";
    case ts.ScriptElementKind.keyword:
      return "keyword";
    default:
      return "unknown";
  }
}

/**
 * Get position info from a definition.
 */
function getDefinitionPosition(
  def: ts.DefinitionInfo,
  ctx: DefinitionContext
): {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
} {
  const sourceFile = ctx.host.getSourceFile(def.fileName);
  if (!sourceFile) {
    return { line: 1, column: 1, endLine: 1, endColumn: 1 };
  }

  const start = sourceFile.getLineAndCharacterOfPosition(def.textSpan.start);
  const end = sourceFile.getLineAndCharacterOfPosition(
    def.textSpan.start + def.textSpan.length
  );

  return {
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

/**
 * Get a preview line for a definition.
 */
function getPreview(
  def: ts.DefinitionInfo,
  ctx: DefinitionContext
): string | undefined {
  const sourceFile = ctx.host.getSourceFile(def.fileName);
  if (!sourceFile) return undefined;

  const start = sourceFile.getLineAndCharacterOfPosition(def.textSpan.start);
  const lines = sourceFile.text.split("\n");
  const line = lines[start.line];

  return line?.trim().slice(0, 100);
}

/**
 * Convert a TypeScript definition to our model.
 */
export function convertDefinition(
  def: ts.DefinitionInfo,
  ctx: DefinitionContext
): Definition {
  const { line, column, endLine, endColumn } = getDefinitionPosition(def, ctx);
  const preview = getPreview(def, ctx);

  return {
    file: def.fileName,
    line,
    column,
    endLine,
    endColumn,
    name: def.name,
    kind: convertSymbolKind(def.kind),
    preview,
    containerName: def.containerName || undefined,
  };
}

/**
 * Convert a TypeScript reference entry to our Definition model.
 */
export function convertReferenceEntry(
  ref: ts.ReferenceEntry,
  ctx: DefinitionContext
): Definition {
  const file = ref.fileName;
  const sourceFile = ctx.host.getSourceFile(file);

  let line = 1, column = 1, endLine = 1, endColumn = 1;
  let name = "";
  let kind: SymbolKind = "unknown";

  if (sourceFile) {
    const start = sourceFile.getLineAndCharacterOfPosition(ref.textSpan.start);
    const end = sourceFile.getLineAndCharacterOfPosition(
      ref.textSpan.start + ref.textSpan.length
    );
    line = start.line + 1;
    column = start.character + 1;
    endLine = end.line + 1;
    endColumn = end.character + 1;

    name = sourceFile.text.slice(
      ref.textSpan.start,
      ref.textSpan.start + ref.textSpan.length
    );

    if (ref.isWriteAccess) {
      kind = "variable";
    }
  }

  return {
    file,
    line,
    column,
    endLine,
    endColumn,
    name,
    kind,
  };
}

/**
 * TypeScript converters - Convert TS types to our domain model.
 */

export {
  convertDiagnostic,
  convertRelatedInfo,
  convertSeverity,
  getLineAndColumn,
  type DiagnosticContext,
} from "./DiagnosticConverter.js";

export {
  convertDefinition,
  convertReferenceEntry,
  convertSymbolKind,
  type DefinitionContext,
} from "./DefinitionConverter.js";

export {
  convertCodeAction,
  type CodeActionContext,
} from "./CodeActionConverter.js";

import * as z from "zod/v4";

export const DiagnosticSeveritySchema = z.enum(["error", "warning", "info", "hint"]);

export const DiagnosticCategorySchema = z.enum([
  "semantic",
  "syntactic",
  "declaration",
  "suggestion",
]);

export const RelatedDiagnosticInfoSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  message: z.string(),
});

export const DiagnosticSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  endLine: z.number(),
  endColumn: z.number(),
  message: z.string(),
  code: z.string(),
  severity: DiagnosticSeveritySchema,
  category: DiagnosticCategorySchema,
  source: z.string(),
  relatedInfo: z.array(RelatedDiagnosticInfoSchema).optional(),
});

export const DiagnosticSummarySchema = z.object({
  errorCount: z.number(),
  warningCount: z.number(),
  infoCount: z.number(),
  hintCount: z.number(),
  filesWithDiagnostics: z.number(),
  totalFiles: z.number(),
});

export const SymbolKindSchema = z.enum([
  "variable",
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "enum_member",
  "property",
  "method",
  "parameter",
  "type_parameter",
  "module",
  "keyword",
  "unknown",
]);

export const DocTagSchema = z.object({
  name: z.string(),
  text: z.string().optional(),
});

export const TypeInfoSchema = z.object({
  type: z.string(),
  name: z.string(),
  kind: SymbolKindSchema,
  documentation: z.string().optional(),
  tags: z.array(DocTagSchema).optional(),
});

export const LocationSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  endLine: z.number(),
  endColumn: z.number(),
});

export const DefinitionSchema = LocationSchema.extend({
  name: z.string(),
  kind: SymbolKindSchema,
  preview: z.string().optional(),
  containerName: z.string().optional(),
});

export const TextChangeSchema = z.object({
  start: z.object({ line: z.number(), column: z.number() }),
  end: z.object({ line: z.number(), column: z.number() }),
  newText: z.string(),
});

export const FileEditSchema = z.object({
  file: z.string(),
  changes: z.array(TextChangeSchema),
});

export const CodeActionKindSchema = z.enum([
  "quickfix",
  "refactor",
  "refactor.extract",
  "refactor.inline",
  "refactor.move",
  "source",
  "source.organizeImports",
  "source.fixAll",
]);

export const CodeActionSchema = z.object({
  title: z.string(),
  kind: CodeActionKindSchema,
  isPreferred: z.boolean().optional(),
  edits: z.array(FileEditSchema),
});

export const ProjectInfoSchema = z.object({
  configPath: z.string(),
  rootDir: z.string(),
  fileCount: z.number(),
  compilerOptions: z.record(z.string(), z.unknown()),
});

import * as z from "zod/v4";

export const SymbolKindSchema = z.enum([
  "file",
  "class",
  "interface",
  "function",
  "method",
  "property",
  "variable",
  "constant",
  "enum",
  "enum_member",
  "type_alias",
  "namespace",
  "module",
  "constructor",
  "field",
  "parameter",
  "import",
]);

export const SymbolInfoSchema: z.ZodType<{
  name: string;
  namePath: string;
  kind: z.infer<typeof SymbolKindSchema>;
  line: number;
  endLine: number;
  children?: Array<{
    name: string;
    namePath: string;
    kind: z.infer<typeof SymbolKindSchema>;
    line: number;
    endLine: number;
    children?: unknown;
  }>;
}> = z.object({
  name: z.string(),
  namePath: z.string(),
  kind: SymbolKindSchema,
  line: z.number(),
  endLine: z.number(),
  children: z.array(z.lazy(() => SymbolInfoSchema)).optional(),
});

export const SymbolContentSchema = z.object({
  name: z.string(),
  namePath: z.string(),
  kind: SymbolKindSchema,
  body: z.string(),
  startLine: z.number(),
  endLine: z.number(),
});

export const EditResultSchema = z.object({
  filePath: z.string(),
  linesChanged: z.number(),
  oldLineCount: z.number(),
  newLineCount: z.number(),
});

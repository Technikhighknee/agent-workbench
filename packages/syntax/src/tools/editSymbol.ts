import * as z from "zod/v4";

import type { EditResult } from "../core/model.js";
import { EditResultSchema } from "./schemas.js";
import type { ToolRegistrar, ToolResponse } from "./types.js";

interface EditSymbolInput {
  file_path: string;
  name_path: string;
  new_body: string;
}

interface EditSymbolOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  result?: EditResult;
}

export const registerEditSymbol: ToolRegistrar = (server, service) => {
  server.registerTool(
    "edit_symbol",
    {
      title: "Edit symbol",
      description: `Replace a symbol's entire body by name path.

INSTEAD OF: Edit tool for functions/classes (which requires exact string matching that can fail).

More reliable than text-based editing - no need for exact string matching.
The symbol is identified by its name path, then completely replaced.

Use cases:
- Rewrite a function implementation
- Replace a class definition
- Update a method without worrying about exact text matching`,
      inputSchema: {
        file_path: z.string().describe("Path to the source file"),
        name_path: z.string().describe("Symbol name path (e.g., 'MyClass/myMethod' or 'myFunction')"),
        new_body: z.string().describe("Complete new body for the symbol (including signature, decorators, etc.)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        result: EditResultSchema.optional(),
      },
    },
    async (input: EditSymbolInput): Promise<ToolResponse<EditSymbolOutput>> => {
      const result = await service.editSymbol({
        filePath: input.file_path,
        namePath: input.name_path,
        newBody: input.new_body,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const r = result.value;
      const summary = `Edited ${input.name_path} in ${r.filePath} (${r.linesChanged} lines changed, ${r.oldLineCount} → ${r.newLineCount} total)`;

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { success: true, result: r },
      };
    }
  );
};

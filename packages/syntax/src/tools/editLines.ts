import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { EditResultSchema } from "./schemas.js";
import type { EditResult } from "../core/model.js";

interface EditLinesInput {
  file_path: string;
  start_line: number;
  end_line: number;
  new_content: string;
}

interface EditLinesOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  result?: EditResult;
}

export const registerEditLines: ToolRegistrar = (server, service) => {
  server.registerTool(
    "edit_lines",
    {
      title: "Edit lines",
      description: `Replace a range of lines by line number.

More reliable than exact text matching - specify line numbers, not text.
Line numbers are 1-indexed and inclusive.

Use cases:
- Replace specific lines when you know the line numbers
- Insert code at a specific location
- Delete lines (use empty new_content)
- Fix a specific section of code`,
      inputSchema: {
        file_path: z.string().describe("Path to the source file"),
        start_line: z.number().describe("First line to replace (1-indexed, inclusive)"),
        end_line: z.number().describe("Last line to replace (1-indexed, inclusive)"),
        new_content: z.string().describe("New content to insert (replaces the line range)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        result: EditResultSchema.optional(),
      },
    },
    async (input: EditLinesInput): Promise<ToolResponse<EditLinesOutput>> => {
      const result = await service.editLines({
        filePath: input.file_path,
        startLine: input.start_line,
        endLine: input.end_line,
        newContent: input.new_content,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const r = result.value;
      const summary = `Edited lines ${input.start_line}-${input.end_line} in ${r.filePath} (${r.linesChanged} lines changed, ${r.oldLineCount} → ${r.newLineCount} total)`;

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { success: true, result: r },
      };
    }
  );
};

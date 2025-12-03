/**
 * preview_edit - Preview the impact of an edit before making it.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PreviewService, ProposedEdit } from "../PreviewService.js";

interface PreviewEditInput {
  file: string;
  edit_type: "symbol" | "text" | "create" | "delete";
  symbol?: string;
  old_text?: string;
  new_content?: string;
  check_types?: boolean;
  analyze_callers?: boolean;
  find_tests?: boolean;
}

interface PreviewEditOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  would_succeed?: boolean;
  type_errors?: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    code: string;
    severity: string;
  }>;
  affected_callers?: Array<{
    file: string;
    symbol: string;
    line: number;
    reason: string;
  }>;
  related_tests?: Array<{
    file: string;
    reason: string;
  }>;
  suggestions?: string[];
  summary?: string;
}

type ToolResponse<T> = {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: T;
};

export function registerPreviewEdit(
  server: McpServer,
  service: PreviewService
): void {
  server.registerTool(
    "preview_edit",
    {
      title: "Preview edit impact",
      description: `Preview the consequences of an edit BEFORE making it.

Shows:
- Type errors that would result
- Callers that might need updates
- Related tests to run after the change
- Suggestions for a smooth edit

Use this to avoid the edit → check → undo → re-edit cycle.

Example: Before changing a function signature, preview to see which callers would break.`,
      inputSchema: {
        file: z.string().describe("File to edit (relative or absolute path)"),
        edit_type: z.enum(["symbol", "text", "create", "delete"]).describe("Type of edit"),
        symbol: z.string().optional().describe("For symbol edits: the symbol name path"),
        old_text: z.string().optional().describe("For text edits: the text to replace"),
        new_content: z.string().optional().describe("The new content"),
        check_types: z.boolean().optional().default(true).describe("Check for type errors"),
        analyze_callers: z.boolean().optional().default(true).describe("Find affected callers"),
        find_tests: z.boolean().optional().default(true).describe("Find related tests"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        would_succeed: z.boolean().optional(),
        type_errors: z.array(z.object({
          file: z.string(),
          line: z.number(),
          column: z.number(),
          message: z.string(),
          code: z.string(),
          severity: z.string(),
        })).optional(),
        affected_callers: z.array(z.object({
          file: z.string(),
          symbol: z.string(),
          line: z.number(),
          reason: z.string(),
        })).optional(),
        related_tests: z.array(z.object({
          file: z.string(),
          reason: z.string(),
        })).optional(),
        suggestions: z.array(z.string()).optional(),
        summary: z.string().optional(),
      },
    },
    async (input: PreviewEditInput): Promise<ToolResponse<PreviewEditOutput>> => {
      const edit: ProposedEdit = {
        file: input.file,
        type: input.edit_type,
        symbol: input.symbol,
        oldText: input.old_text,
        newContent: input.new_content,
      };

      const result = await service.previewEdit(edit, {
        checkTypes: input.check_types,
        analyzeCallers: input.analyze_callers,
        findTests: input.find_tests,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const preview = result.value;

      // Format output
      const lines: string[] = [];
      lines.push(`# Edit Preview: ${input.file}`);
      lines.push("");
      lines.push(`**Would Succeed:** ${preview.wouldSucceed ? "Yes ✓" : "No ✗"}`);
      lines.push("");

      if (preview.typeErrors.length > 0) {
        lines.push(`## Type Errors (${preview.typeErrors.length})`);
        for (const err of preview.typeErrors.slice(0, 10)) {
          lines.push(`- ${err.file}:${err.line}:${err.column} - ${err.message}`);
        }
        if (preview.typeErrors.length > 10) {
          lines.push(`  ... and ${preview.typeErrors.length - 10} more`);
        }
        lines.push("");
      }

      if (preview.affectedCallers.length > 0) {
        lines.push(`## Affected Callers (${preview.affectedCallers.length})`);
        for (const caller of preview.affectedCallers.slice(0, 10)) {
          lines.push(`- ${caller.file}:${caller.line} - ${caller.reason}`);
        }
        if (preview.affectedCallers.length > 10) {
          lines.push(`  ... and ${preview.affectedCallers.length - 10} more`);
        }
        lines.push("");
      }

      if (preview.relatedTests.length > 0) {
        lines.push(`## Related Tests (${preview.relatedTests.length})`);
        for (const test of preview.relatedTests) {
          lines.push(`- ${test.file} (${test.reason})`);
        }
        lines.push("");
      }

      if (preview.suggestions.length > 0) {
        lines.push(`## Suggestions`);
        for (const suggestion of preview.suggestions) {
          lines.push(`- ${suggestion}`);
        }
        lines.push("");
      }

      lines.push(`**Summary:** ${preview.summary}`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          would_succeed: preview.wouldSucceed,
          type_errors: preview.typeErrors,
          affected_callers: preview.affectedCallers,
          related_tests: preview.relatedTests,
          suggestions: preview.suggestions,
          summary: preview.summary,
        },
      };
    }
  );
}

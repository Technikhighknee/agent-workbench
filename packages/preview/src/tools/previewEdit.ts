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

export function registerPreviewEdit(
  server: McpServer,
  service: PreviewService
): void {
  // Cast to avoid deep type instantiation with complex schema
  (server as { registerTool: Function }).registerTool(
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
        check_types: z.boolean().optional().describe("Check for type errors (default: true)"),
        analyze_callers: z.boolean().optional().describe("Find affected callers (default: true)"),
        find_tests: z.boolean().optional().describe("Find related tests (default: true)"),
      },
    },
    (async (input: PreviewEditInput) => {
      const edit: ProposedEdit = {
        file: input.file,
        type: input.edit_type,
        symbol: input.symbol,
        oldText: input.old_text,
        newContent: input.new_content,
      };

      const result = await service.previewEdit(edit, {
        checkTypes: input.check_types ?? true,
        analyzeCallers: input.analyze_callers ?? true,
        findTests: input.find_tests ?? true,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
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
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }) as Parameters<typeof server.registerTool>[2]
  );
}

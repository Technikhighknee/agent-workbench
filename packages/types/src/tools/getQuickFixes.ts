import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { CodeActionSchema } from "./schemas.js";
import type { CodeAction } from "../core/model.js";

interface GetQuickFixesInput {
  file: string;
  line: number;
  column: number;
  end_line?: number;
  end_column?: number;
}

interface GetQuickFixesOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  fixes?: CodeAction[];
}

export const registerGetQuickFixes: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_quick_fixes",
    {
      title: "Get quick fixes",
      description: `Get available quick fixes and code actions for a position or selection.

Returns TypeScript's suggested fixes for errors at the location. Each fix includes the exact edits needed to apply it.

Use cases:
- Auto-fix type errors
- Add missing imports
- Implement interface methods
- Fix spelling suggestions`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file"),
        line: z.number().describe("Start line number (1-indexed)"),
        column: z.number().describe("Start column number (1-indexed)"),
        end_line: z.number().optional().describe("End line number (defaults to start line)"),
        end_column: z.number().optional().describe("End column number (defaults to start column)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        fixes: z.array(CodeActionSchema).optional(),
      },
    },
    async (input: GetQuickFixesInput): Promise<ToolResponse<GetQuickFixesOutput>> => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text", text: "Error: TypeScript service not initialized" }],
          structuredContent: { success: false, error: "Service not initialized" },
        };
      }

      const result = service.getCodeActions({
        file: input.file,
        startLine: input.line,
        startColumn: input.column,
        endLine: input.end_line ?? input.line,
        endColumn: input.end_column ?? input.column,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error.message}` }],
          structuredContent: { success: false, error: result.error.message },
        };
      }

      const fixes = result.value;

      if (fixes.length === 0) {
        return {
          content: [{ type: "text", text: "No quick fixes available at this position" }],
          structuredContent: { success: true, fixes: [] },
        };
      }

      const formatted = formatFixes(fixes);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          fixes,
        },
      };
    }
  );
};

function formatFixes(fixes: CodeAction[]): string {
  const lines: string[] = [];

  lines.push(`# ${fixes.length} Quick Fix${fixes.length > 1 ? "es" : ""} Available`);
  lines.push("");

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const preferred = fix.isPreferred ? " ⭐" : "";
    lines.push(`## ${i + 1}. ${fix.title}${preferred}`);
    lines.push(`Kind: ${fix.kind}`);
    lines.push("");

    if (fix.edits.length > 0) {
      lines.push("**Edits:**");
      for (const edit of fix.edits) {
        lines.push(`- ${edit.file}: ${edit.changes.length} change(s)`);
        for (const change of edit.changes) {
          const preview = change.newText.split("\n")[0].slice(0, 50);
          lines.push(`  L${change.start.line}:${change.start.column} → "${preview}${change.newText.length > 50 ? "..." : ""}"`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

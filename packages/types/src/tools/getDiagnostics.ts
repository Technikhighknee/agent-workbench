import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { DiagnosticSchema, DiagnosticSummarySchema } from "./schemas.js";
import type { Diagnostic, DiagnosticSummary } from "../core/model.js";

interface GetDiagnosticsInput {
  file?: string;
  errors_only?: boolean;
  limit?: number;
}

interface GetDiagnosticsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  diagnostics?: Diagnostic[];
  summary?: DiagnosticSummary;
}

export const registerGetDiagnostics: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_diagnostics",
    {
      title: "Get type diagnostics",
      description: `Get TypeScript type errors, warnings, and suggestions for a file or the entire project.

This is the primary tool for checking if code is type-correct. Use it after making edits to verify no type errors were introduced.

Use cases:
- Check if edits broke type safety
- Find all type errors in a project
- Get detailed error messages with locations
- Understand why code doesn't compile`,
      inputSchema: {
        file: z.string().optional().describe("Specific file to check (if omitted, checks entire project)"),
        errors_only: z.boolean().optional().describe("Only return errors, not warnings or hints"),
        limit: z.number().optional().describe("Maximum number of diagnostics to return"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        diagnostics: z.array(DiagnosticSchema).optional(),
        summary: DiagnosticSummarySchema.optional(),
      },
    },
    async (input: GetDiagnosticsInput): Promise<ToolResponse<GetDiagnosticsOutput>> => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text", text: "Error: TypeScript service not initialized. No tsconfig.json found." }],
          structuredContent: { success: false, error: "Service not initialized" },
        };
      }

      const result = await service.getDiagnostics({
        file: input.file,
        errorsOnly: input.errors_only,
        limit: input.limit,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error.message}` }],
          structuredContent: { success: false, error: result.error.message },
        };
      }

      const diagnostics = result.value;
      const summaryResult = await service.getDiagnosticSummary();
      const summary = summaryResult.ok ? summaryResult.value : undefined;

      // Format output
      const formatted = formatDiagnostics(diagnostics, summary);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          diagnostics,
          summary,
        },
      };
    }
  );
};

function formatDiagnostics(diagnostics: Diagnostic[], summary?: DiagnosticSummary): string {
  if (diagnostics.length === 0) {
    return "No diagnostics found. Code is type-correct.";
  }

  const lines: string[] = [];

  // Summary header
  if (summary) {
    lines.push(`# Diagnostic Summary`);
    lines.push(`- Errors: ${summary.errorCount}`);
    lines.push(`- Warnings: ${summary.warningCount}`);
    lines.push(`- Files with issues: ${summary.filesWithDiagnostics}/${summary.totalFiles}`);
    lines.push("");
  }

  // Group by file
  const byFile = new Map<string, Diagnostic[]>();
  for (const diag of diagnostics) {
    const existing = byFile.get(diag.file) ?? [];
    existing.push(diag);
    byFile.set(diag.file, existing);
  }

  for (const [file, fileDiags] of byFile) {
    lines.push(`## ${file}`);
    for (const diag of fileDiags) {
      const icon = getSeverityIcon(diag.severity);
      lines.push(`${icon} L${diag.line}:${diag.column} [${diag.code}] ${diag.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case "error": return "❌";
    case "warning": return "⚠️";
    case "info": return "ℹ️";
    case "hint": return "💡";
    default: return "•";
  }
}

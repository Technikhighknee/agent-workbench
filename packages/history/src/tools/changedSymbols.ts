/**
 * changed_symbols tool - Get symbols that changed between git refs.
 * Bridges git history with semantic code understanding.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface ChangedSymbolsInput {
  from_ref?: string;
  to_ref?: string;
  file_pattern?: string;
}

export const registerChangedSymbols: ToolRegistrar = (server, service) => {
  server.registerTool(
    "changed_symbols",
    {
      title: "Changed symbols",
      description:
        "Get symbols (functions, classes, methods) that changed between git refs. Useful for code review and understanding what changed semantically.",
      inputSchema: {
        from_ref: z
          .string()
          .default("HEAD~1")
          .describe("Starting git ref (default: HEAD~1)"),
        to_ref: z
          .string()
          .default("HEAD")
          .describe("Ending git ref (default: HEAD)"),
        file_pattern: z
          .string()
          .optional()
          .describe("Optional file pattern to filter (e.g., 'src/**/*.ts')"),
      },
    },
    async (input: ChangedSymbolsInput) => {
      const fromRef = input.from_ref ?? "HEAD~1";
      const toRef = input.to_ref ?? "HEAD";
      const result = await service.changedSymbols(fromRef, toRef, input.file_pattern);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const data = result.value;
      const lines: string[] = [];

      lines.push(`# Changed Symbols: ${fromRef} → ${toRef}`);
      lines.push("");

      const totalChanges = data.added.length + data.modified.length + data.deleted.length;
      lines.push(`## Summary`);
      lines.push(`- **Files analyzed:** ${data.filesAnalyzed}`);
      lines.push(`- **Total symbols changed:** ${totalChanges}`);
      lines.push(`  - Added: ${data.added.length}`);
      lines.push(`  - Modified: ${data.modified.length}`);
      lines.push(`  - Deleted: ${data.deleted.length}`);

      if (data.parseErrors.length > 0) {
        lines.push(`- **Parse errors:** ${data.parseErrors.length}`);
      }
      lines.push("");

      if (data.added.length > 0) {
        lines.push(`## Added (${data.added.length})`);
        lines.push("");
        for (const sym of data.added) {
          lines.push(`- **${sym.kind}** \`${sym.qualifiedName}\``);
          lines.push(`  - File: \`${sym.file}:${sym.line}\``);
        }
        lines.push("");
      }

      if (data.modified.length > 0) {
        lines.push(`## Modified (${data.modified.length})`);
        lines.push("");
        for (const sym of data.modified) {
          lines.push(`- **${sym.kind}** \`${sym.qualifiedName}\``);
          lines.push(`  - File: \`${sym.file}:${sym.line}\``);
        }
        lines.push("");
      }

      if (data.deleted.length > 0) {
        lines.push(`## Deleted (${data.deleted.length})`);
        lines.push("");
        for (const sym of data.deleted) {
          lines.push(`- **${sym.kind}** \`${sym.qualifiedName}\``);
          lines.push(`  - File: \`${sym.file}:${sym.line}\``);
        }
        lines.push("");
      }

      if (data.parseErrors.length > 0) {
        lines.push(`## Parse Errors`);
        lines.push("");
        for (const file of data.parseErrors) {
          lines.push(`- \`${file}\``);
        }
        lines.push("");
      }

      if (totalChanges === 0) {
        lines.push("*No symbol changes detected in supported languages.*");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
};

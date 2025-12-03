/**
 * check_file - Check a single file for type errors.
 *
 * This is THE primary tool. Fast, focused, no bullshit.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeChecker, Diagnostic } from "../TypeChecker.js";

export function registerCheckFile(server: McpServer, checker: TypeChecker): void {
  server.registerTool(
    "check_file",
    {
      title: "Check file for type errors",
      description: `Check a single TypeScript file for type errors.

Fast, focused check of ONE file. Returns errors with locations.

Use this after editing a file to verify no type errors were introduced.

NOTE: For project-wide checks, use \`tsc --noEmit\` directly.`,
      inputSchema: {
        file: z.string().describe("Path to the TypeScript file to check"),
      },
    },
    async ({ file }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      try {
        const diagnostics = await checker.checkFile(file);

        if (diagnostics.length === 0) {
          return {
            content: [{ type: "text", text: `✓ No errors in ${file}` }],
          };
        }

        const errors = diagnostics.filter((d) => d.severity === "error");
        const warnings = diagnostics.filter((d) => d.severity === "warning");

        const lines: string[] = [];
        lines.push(`# ${file}`);
        lines.push(`**${errors.length} error(s), ${warnings.length} warning(s)**`);
        lines.push("");

        for (const d of diagnostics) {
          const icon = d.severity === "error" ? "✗" : "⚠";
          lines.push(`${icon} ${d.file}:${d.line}:${d.column} - ${d.message} [${d.code}]`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
        };
      }
    }
  );
}

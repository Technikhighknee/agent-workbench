import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface RenameSymbolInput {
  old_name: string;
  new_name: string;
  dry_run?: boolean;
}

interface FileChange {
  file: string;
  replacements: number;
}

interface RenameSymbolOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  oldName?: string;
  newName?: string;
  filesModified?: number;
  totalReplacements?: number;
  changes?: FileChange[];
  dryRun?: boolean;
}

export function registerRenameSymbol(
  server: McpServer,
  index: ProjectIndex,
  syntax: SyntaxService
): void {
  server.registerTool(
    "rename_symbol",
    {
      title: "Rename symbol",
      description: `Rename a symbol (variable, function, class, etc.) across all indexed files.

Requires index_project to be called first. Finds all references to the symbol
and replaces them with the new name.

IMPORTANT: This performs text-based replacement. For complex renames that could
cause conflicts (e.g., renaming 'get' which appears in many contexts), use
dry_run=true first to preview changes.

Use cases:
- Rename a function/method throughout the codebase
- Rename a class or interface
- Refactor variable names consistently`,
      inputSchema: {
        old_name: z.string().describe("Current name of the symbol to rename"),
        new_name: z.string().describe("New name for the symbol"),
        dry_run: z
          .boolean()
          .optional()
          .describe("If true, show what would change without making changes (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        oldName: z.string().optional(),
        newName: z.string().optional(),
        filesModified: z.number().optional(),
        totalReplacements: z.number().optional(),
        changes: z
          .array(
            z.object({
              file: z.string(),
              replacements: z.number(),
            })
          )
          .optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (input: RenameSymbolInput): Promise<ToolResponse<RenameSymbolOutput>> => {
      const { old_name, new_name, dry_run = false } = input;

      // Validate names
      if (old_name === new_name) {
        return {
          content: [{ type: "text", text: "Error: Old and new names are identical" }],
          structuredContent: {
            success: false,
            error: "Old and new names are identical",
          },
        };
      }

      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(new_name)) {
        return {
          content: [{ type: "text", text: "Error: New name is not a valid identifier" }],
          structuredContent: {
            success: false,
            error: "New name is not a valid identifier",
          },
        };
      }

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      // Find all references
      const refsResult = await index.findReferences(old_name);
      if (!refsResult.ok) {
        return {
          content: [{ type: "text", text: `Error: ${refsResult.error}` }],
          structuredContent: {
            success: false,
            error: refsResult.error,
          },
        };
      }

      const references = refsResult.value;
      if (references.length === 0) {
        return {
          content: [{ type: "text", text: `No references found for "${old_name}"` }],
          structuredContent: {
            success: false,
            error: `No references found for "${old_name}"`,
          },
        };
      }

      // Group by file
      const byFile = new Map<string, number>();
      for (const ref of references) {
        byFile.set(ref.filePath, (byFile.get(ref.filePath) ?? 0) + 1);
      }

      const changes: FileChange[] = Array.from(byFile.entries()).map(([file, count]) => ({
        file,
        replacements: count,
      }));

      if (dry_run) {
        // Just return what would change
        const lines: string[] = [
          `Dry run: Would rename "${old_name}" to "${new_name}"`,
          `  ${references.length} replacement(s) in ${byFile.size} file(s)`,
          "",
          "Files to modify:",
        ];

        for (const change of changes) {
          lines.push(`  ${change.file}: ${change.replacements} replacement(s)`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: {
            success: true,
            oldName: old_name,
            newName: new_name,
            filesModified: byFile.size,
            totalReplacements: references.length,
            changes,
            dryRun: true,
          },
        };
      }

      // Actually perform the rename
      // We need to process files and replace the symbol name as an identifier
      const pattern = new RegExp(`\\b${escapeRegex(old_name)}\\b`, "g");
      let totalReplacements = 0;
      const actualChanges: FileChange[] = [];

      for (const filePath of byFile.keys()) {
        const readResult = syntax.readFile(filePath);
        if (!readResult.ok) continue;

        const content = readResult.value;
        const newContent = content.replace(pattern, new_name);

        if (content !== newContent) {
          const writeResult = syntax.writeFile(filePath, newContent);
          if (writeResult.ok) {
            const count = byFile.get(filePath) ?? 0;
            totalReplacements += count;
            actualChanges.push({ file: filePath, replacements: count });
          }
        }
      }

      // Re-index affected files
      for (const change of actualChanges) {
        await index.reindexFile(change.file);
      }

      const lines: string[] = [
        `Renamed "${old_name}" to "${new_name}"`,
        `  ${totalReplacements} replacement(s) in ${actualChanges.length} file(s)`,
        "",
        "Modified files:",
      ];

      for (const change of actualChanges) {
        lines.push(`  ${change.file}: ${change.replacements} replacement(s)`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          oldName: old_name,
          newName: new_name,
          filesModified: actualChanges.length,
          totalReplacements,
          changes: actualChanges,
          dryRun: false,
        },
      };
    }
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

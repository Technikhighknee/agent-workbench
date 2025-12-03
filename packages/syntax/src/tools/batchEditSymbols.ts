/**
 * batch_edit_symbols - Edit multiple symbols across files atomically
 *
 * Design principles:
 * 1. All edits validated before any are applied
 * 2. Atomic: all succeed or all fail with rollback
 * 3. Handles interdependencies (edits in same file)
 * 4. dry_run support for preview
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

const SymbolEditSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  name_path: z.string().describe("Symbol name path (e.g., 'MyClass/myMethod' or 'myFunction')"),
  new_body: z.string().describe("Complete new body for the symbol"),
});

type SymbolEdit = z.infer<typeof SymbolEditSchema>;

interface BatchEditSymbolsInput {
  edits: SymbolEdit[];
  dry_run?: boolean;
}

interface SymbolEditResult {
  file_path: string;
  name_path: string;
  success: boolean;
  error?: string;
  lines_changed?: number;
  old_line_count?: number;
  new_line_count?: number;
}

interface BatchEditSymbolsOutput extends Record<string, unknown> {
  success: boolean;
  applied: boolean;
  dry_run: boolean;
  results: SymbolEditResult[];
  summary: {
    total: number;
    files_affected: number;
    successful: number;
    failed: number;
    total_lines_changed: number;
  };
  error?: string;
}

export function registerBatchEditSymbols(
  server: McpServer,
  service: SyntaxService
): void {
  server.registerTool(
    "batch_edit_symbols",
    {
      title: "Batch edit symbols",
      description: `Edit multiple symbols across files atomically. All edits succeed or all fail with rollback.

Use cases:
- Change a function signature and update all callers
- Refactor related functions together
- Rename and update multiple methods in a class

All symbols are validated before any changes are made. If any edit would fail, no changes are applied.`,
      inputSchema: {
        edits: z
          .array(SymbolEditSchema)
          .min(1)
          .describe("Array of symbol edits to apply atomically"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("Preview changes without applying (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        applied: z.boolean(),
        dry_run: z.boolean(),
        results: z.array(z.object({
          file_path: z.string(),
          name_path: z.string(),
          success: z.boolean(),
          error: z.string().optional(),
          lines_changed: z.number().optional(),
          old_line_count: z.number().optional(),
          new_line_count: z.number().optional(),
        })),
        summary: z.object({
          total: z.number(),
          files_affected: z.number(),
          successful: z.number(),
          failed: z.number(),
          total_lines_changed: z.number(),
        }),
        error: z.string().optional(),
      },
    },
    async (input: BatchEditSymbolsInput): Promise<ToolResponse<BatchEditSymbolsOutput>> => {
      const { edits, dry_run = false } = input;

      const results: SymbolEditResult[] = [];
      const originalContents = new Map<string, string>();
      const filesAffected = new Set<string>();
      let totalLinesChanged = 0;

      // Group edits by file for proper ordering
      const editsByFile = new Map<string, SymbolEdit[]>();
      for (const edit of edits) {
        const existing = editsByFile.get(edit.file_path) || [];
        existing.push(edit);
        editsByFile.set(edit.file_path, existing);
      }

      // Phase 1: Validate all edits and store original contents
      for (const edit of edits) {
        // Store original content for rollback (only once per file)
        if (!originalContents.has(edit.file_path)) {
          const readResult = service.readFile(edit.file_path);
          if (!readResult.ok) {
            results.push({
              file_path: edit.file_path,
              name_path: edit.name_path,
              success: false,
              error: `Cannot read file: ${readResult.error.message}`,
            });
            continue;
          }
          originalContents.set(edit.file_path, readResult.value);
        }

        // Validate symbol exists
        const listResult = await service.listSymbols({ filePath: edit.file_path });
        if (!listResult.ok) {
          results.push({
            file_path: edit.file_path,
            name_path: edit.name_path,
            success: false,
            error: `Cannot parse file: ${listResult.error}`,
          });
          continue;
        }

        // Check if symbol exists by trying to read it
        const readSymbolResult = await service.readSymbol({
          filePath: edit.file_path,
          namePath: edit.name_path,
        });

        if (!readSymbolResult.ok) {
          results.push({
            file_path: edit.file_path,
            name_path: edit.name_path,
            success: false,
            error: `Symbol not found: ${edit.name_path}`,
          });
          continue;
        }

        // Validation passed
        results.push({
          file_path: edit.file_path,
          name_path: edit.name_path,
          success: true,
          lines_changed: 0, // Will be updated after actual edit
        });
        filesAffected.add(edit.file_path);
      }

      // Check if any validation failed
      const failedResults = results.filter((r) => !r.success);
      if (failedResults.length > 0) {
        const summary = {
          total: edits.length,
          files_affected: filesAffected.size,
          successful: results.filter((r) => r.success).length,
          failed: failedResults.length,
          total_lines_changed: 0,
        };

        const errorMessages = failedResults
          .map((r) => `${r.file_path}:${r.name_path}: ${r.error}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Validation failed for ${failedResults.length} edit(s):\n${errorMessages}\n\nNo changes were applied.`,
            },
          ],
          structuredContent: {
            success: false,
            applied: false,
            dry_run,
            results,
            summary,
            error: `Validation failed for ${failedResults.length} edit(s)`,
          },
        };
      }

      // Phase 2: If dry_run, return preview
      if (dry_run) {
        const summary = {
          total: edits.length,
          files_affected: filesAffected.size,
          successful: results.length,
          failed: 0,
          total_lines_changed: 0, // Can't know without applying
        };

        const previewText = edits
          .map((e) => `${e.file_path}:${e.name_path}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Dry run: ${edits.length} symbol edit(s) would be applied to ${filesAffected.size} file(s):\n\n${previewText}`,
            },
          ],
          structuredContent: {
            success: true,
            applied: false,
            dry_run: true,
            results,
            summary,
          },
        };
      }

      // Phase 3: Apply all edits (file by file to handle multiple edits in same file)
      const appliedFiles: string[] = [];
      let applyError: string | undefined;

      try {
        for (const [filePath, fileEdits] of editsByFile) {
          // Apply edits for this file in order
          for (const edit of fileEdits) {
            const editResult = await service.editSymbol({
              filePath: edit.file_path,
              namePath: edit.name_path,
              newBody: edit.new_body,
            });

            if (!editResult.ok) {
              throw new Error(`Failed to edit ${edit.name_path} in ${edit.file_path}: ${editResult.error}`);
            }

            // Update result with actual changes
            const resultIndex = results.findIndex(
              (r) => r.file_path === edit.file_path && r.name_path === edit.name_path
            );
            if (resultIndex >= 0) {
              results[resultIndex].lines_changed = editResult.value.linesChanged;
              results[resultIndex].old_line_count = editResult.value.oldLineCount;
              results[resultIndex].new_line_count = editResult.value.newLineCount;
              totalLinesChanged += editResult.value.linesChanged;
            }
          }
          appliedFiles.push(filePath);
        }
      } catch (error) {
        applyError = error instanceof Error ? error.message : String(error);

        // Rollback: restore original contents for all files we touched
        for (const filePath of appliedFiles) {
          const original = originalContents.get(filePath);
          if (original !== undefined) {
            service.writeFile(filePath, original);
          }
        }

        // Also rollback the file that failed (partial edits)
        for (const [filePath] of editsByFile) {
          if (!appliedFiles.includes(filePath)) {
            const original = originalContents.get(filePath);
            if (original !== undefined) {
              service.writeFile(filePath, original);
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Error applying edits: ${applyError}\n\nAll changes have been rolled back.`,
            },
          ],
          structuredContent: {
            success: false,
            applied: false,
            dry_run: false,
            results,
            summary: {
              total: edits.length,
              files_affected: filesAffected.size,
              successful: 0,
              failed: edits.length,
              total_lines_changed: 0,
            },
            error: applyError,
          },
        };
      }

      // Success
      const summary = {
        total: edits.length,
        files_affected: filesAffected.size,
        successful: edits.length,
        failed: 0,
        total_lines_changed: totalLinesChanged,
      };

      return {
        content: [
          {
            type: "text",
            text: `Successfully edited ${edits.length} symbol(s) across ${filesAffected.size} file(s). ${totalLinesChanged} lines changed.`,
          },
        ],
        structuredContent: {
          success: true,
          applied: true,
          dry_run: false,
          results,
          summary,
        },
      };
    }
  );
}

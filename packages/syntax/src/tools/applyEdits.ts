/**
 * apply_edits - Apply multiple edits across files atomically
 *
 * Design principles:
 * 1. Same pattern as Edit tool (old_string → new_string)
 * 2. Validate ALL edits before applying ANY
 * 3. Atomic: all succeed or all fail with rollback
 * 4. dry_run support for preview
 */

import { z } from "zod";
import { McpServer } from "@anthropic/sdk-mcp";
import { SyntaxService } from "../core/services/SyntaxService.js";

const EditSchema = z.object({
  file_path: z.string().describe("Absolute path to the file"),
  old_string: z.string().describe("Text to find and replace"),
  new_string: z.string().describe("Text to replace with"),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace all occurrences (default: false, requires unique match)"),
});

const ApplyEditsSchema = z.object({
  edits: z
    .array(EditSchema)
    .min(1)
    .describe("Array of edits to apply atomically"),
  dry_run: z
    .boolean()
    .optional()
    .default(false)
    .describe("Preview changes without applying (default: false)"),
});

type Edit = z.infer<typeof EditSchema>;

interface EditResult {
  file_path: string;
  success: boolean;
  error?: string;
  occurrences?: number;
  preview?: {
    before: string;
    after: string;
  };
}

interface ApplyEditsOutput {
  success: boolean;
  applied: boolean;
  dry_run: boolean;
  results: EditResult[];
  summary: {
    total: number;
    files_affected: number;
    successful: number;
    failed: number;
  };
  error?: string;
}

export function registerApplyEdits(
  server: McpServer,
  syntax: SyntaxService
): void {
  server.tool(
    "apply_edits",
    "Apply multiple edits across files atomically. All edits succeed or all fail.",
    ApplyEditsSchema.shape,
    async (params): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: ApplyEditsOutput }> => {
      const { edits, dry_run } = ApplyEditsSchema.parse(params);

      const results: EditResult[] = [];
      const originalContents = new Map<string, string>();
      const newContents = new Map<string, string>();
      const filesAffected = new Set<string>();

      // Phase 1: Validate all edits and compute new contents
      for (const edit of edits) {
        const result = await validateAndPrepareEdit(syntax, edit, newContents);
        results.push(result);

        if (result.success) {
          filesAffected.add(edit.file_path);

          // Store original content for rollback (only once per file)
          if (!originalContents.has(edit.file_path)) {
            const readResult = syntax.readFile(edit.file_path);
            if (readResult.ok) {
              originalContents.set(edit.file_path, readResult.value);
            }
          }
        }
      }

      // Check if any validation failed
      const failedResults = results.filter((r) => !r.success);
      if (failedResults.length > 0) {
        const summary = {
          total: edits.length,
          files_affected: filesAffected.size,
          successful: results.filter((r) => r.success).length,
          failed: failedResults.length,
        };

        const errorMessages = failedResults
          .map((r) => `${r.file_path}: ${r.error}`)
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
        };

        const previewText = results
          .map((r) => {
            if (r.preview) {
              return `${r.file_path}:\n  - "${truncate(r.preview.before, 50)}" → "${truncate(r.preview.after, 50)}"${r.occurrences && r.occurrences > 1 ? ` (${r.occurrences} occurrences)` : ""}`;
            }
            return `${r.file_path}: OK`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `Dry run: ${results.length} edit(s) would be applied to ${filesAffected.size} file(s):\n\n${previewText}`,
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

      // Phase 3: Apply all edits
      const appliedFiles: string[] = [];
      let applyError: string | undefined;

      try {
        for (const [filePath, content] of newContents) {
          const writeResult = syntax.writeFile(filePath, content);
          if (!writeResult.ok) {
            throw new Error(`Failed to write ${filePath}: ${writeResult.error.message}`);
          }
          appliedFiles.push(filePath);
        }
      } catch (error) {
        applyError = error instanceof Error ? error.message : String(error);

        // Rollback: restore original contents
        for (const filePath of appliedFiles) {
          const original = originalContents.get(filePath);
          if (original !== undefined) {
            syntax.writeFile(filePath, original);
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
      };

      return {
        content: [
          {
            type: "text",
            text: `Successfully applied ${edits.length} edit(s) to ${filesAffected.size} file(s).`,
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

async function validateAndPrepareEdit(
  syntax: SyntaxService,
  edit: Edit,
  newContents: Map<string, string>
): Promise<EditResult> {
  const { file_path, old_string, new_string, replace_all } = edit;

  // Read current content (or use already-modified content if file was edited earlier)
  let content: string;
  if (newContents.has(file_path)) {
    content = newContents.get(file_path)!;
  } else {
    const readResult = syntax.readFile(file_path);
    if (!readResult.ok) {
      return {
        file_path,
        success: false,
        error: `Cannot read file: ${readResult.error.message}`,
      };
    }
    content = readResult.value;
  }

  // Check if old_string exists
  if (!content.includes(old_string)) {
    return {
      file_path,
      success: false,
      error: `String not found: "${truncate(old_string, 50)}"`,
    };
  }

  // Count occurrences
  const occurrences = countOccurrences(content, old_string);

  // If not replace_all, ensure uniqueness
  if (!replace_all && occurrences > 1) {
    return {
      file_path,
      success: false,
      error: `String "${truncate(old_string, 30)}" found ${occurrences} times. Use replace_all=true or provide more context for uniqueness.`,
    };
  }

  // Check for no-op
  if (old_string === new_string) {
    return {
      file_path,
      success: false,
      error: "old_string and new_string are identical",
    };
  }

  // Compute new content
  const newContent = replace_all
    ? content.split(old_string).join(new_string)
    : content.replace(old_string, new_string);

  // Store for later application
  newContents.set(file_path, newContent);

  return {
    file_path,
    success: true,
    occurrences,
    preview: {
      before: old_string,
      after: new_string,
    },
  };
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.substring(0, maxLen - 3) + "...";
}

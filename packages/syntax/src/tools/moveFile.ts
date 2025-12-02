/**
 * move_file tool - Move a file and update all imports across the codebase.
 */

import * as z from "zod/v4";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface MoveFileInput {
  source: string;
  destination: string;
  dry_run?: boolean;
}

interface FileUpdate {
  file: string;
  oldImport: string;
  newImport: string;
  line: number;
}

interface MoveFileOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  source?: string;
  destination?: string;
  updatedFiles?: number;
  updates?: FileUpdate[];
  dryRun?: boolean;
}

export function registerMoveFile(
  server: McpServer,
  index: ProjectIndex,
  syntax: SyntaxService
): void {
  server.registerTool(
    "move_file",
    {
      title: "Move file",
      description: `Move a source file to a new location and update all imports across the codebase.

This tool:
1. Moves the source file to the destination path
2. Finds all files that import from the old path
3. Updates their import statements to use the new path
4. Re-indexes affected files

Use cases:
- Reorganize codebase structure without breaking imports
- Rename files while keeping the codebase functional
- Move files between directories

IMPORTANT: Use dry_run=true first to preview changes.`,
      inputSchema: {
        source: z.string().describe("Current file path (relative to project root)"),
        destination: z.string().describe("New file path (relative to project root)"),
        dry_run: z
          .boolean()
          .optional()
          .describe("If true, show what would change without making changes (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        source: z.string().optional(),
        destination: z.string().optional(),
        updatedFiles: z.number().optional(),
        updates: z
          .array(
            z.object({
              file: z.string(),
              oldImport: z.string(),
              newImport: z.string(),
              line: z.number(),
            })
          )
          .optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (input: MoveFileInput): Promise<ToolResponse<MoveFileOutput>> => {
      const { source, destination, dry_run = false } = input;

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      // Validate source exists
      const sourceTree = index.getTree(source);
      if (!sourceTree) {
        return {
          content: [{ type: "text", text: `Error: Source file not found in index: ${source}` }],
          structuredContent: {
            success: false,
            error: `Source file not found in index: ${source}`,
          },
        };
      }

      // Check destination doesn't exist
      const destTree = index.getTree(destination);
      if (destTree) {
        return {
          content: [{ type: "text", text: `Error: Destination file already exists: ${destination}` }],
          structuredContent: {
            success: false,
            error: `Destination file already exists: ${destination}`,
          },
        };
      }

      // Find all files that import from the source
      const updates: FileUpdate[] = [];

      // Get all indexed files
      const indexedFiles = index.getIndexedFiles();

      // Calculate relative path between two files
      const calcRelativePath = (fromFile: string, toFile: string): string => {
        const fromDir = path.dirname(fromFile);
        let relative = path.relative(fromDir, toFile);

        // Ensure it starts with ./ or ../
        if (!relative.startsWith('.')) {
          relative = './' + relative;
        }

        // Remove extension for ESM imports, then add .js
        const ext = path.extname(relative);
        if (['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'].includes(ext)) {
          relative = relative.slice(0, -ext.length);
          // For .ts files, use .js extension in imports (ESM convention)
          if (ext === '.ts' || ext === '.tsx') {
            relative += '.js';
          } else if (ext === '.mts') {
            relative += '.mjs';
          } else {
            relative += ext;
          }
        }

        return relative;
      };

      // Search all indexed files for imports
      for (const file of indexedFiles) {
        if (file === source) continue; // Skip the source file itself

        const readResult = syntax.readFile(file);
        if (!readResult.ok) continue;

        const content = readResult.value;
        const lines = content.split('\n');

        // Check each line for imports from the source file
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Match import statements with various patterns
          // import X from "path"
          // import { X } from "path"
          // import * as X from "path"
          // import "path"
          const importMatch = line.match(/import\s+.*?\s*from\s*['"]([^'"]+)['"]/);

          if (importMatch) {
            const importPath = importMatch[1];

            // Check if this import resolves to our source file
            if (isImportFromFile(file, importPath, source)) {
              const newImportPath = calcRelativePath(file, destination);

              updates.push({
                file,
                oldImport: importPath,
                newImport: newImportPath,
                line: i + 1,
              });
            }
          }

          // Also match dynamic imports: import("path")
          const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
          if (dynamicMatch) {
            const importPath = dynamicMatch[1];

            if (isImportFromFile(file, importPath, source)) {
              const newImportPath = calcRelativePath(file, destination);

              updates.push({
                file,
                oldImport: importPath,
                newImport: newImportPath,
                line: i + 1,
              });
            }
          }

          // Also match re-exports: export { X } from "path" or export * from "path"
          const reexportMatch = line.match(/export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/);
          if (reexportMatch) {
            const importPath = reexportMatch[1];

            if (isImportFromFile(file, importPath, source)) {
              const newImportPath = calcRelativePath(file, destination);

              updates.push({
                file,
                oldImport: importPath,
                newImport: newImportPath,
                line: i + 1,
              });
            }
          }
        }
      }

      if (dry_run) {
        const uniqueFiles = new Set(updates.map(u => u.file));
        const lines: string[] = [
          `Dry run: Would move "${source}" to "${destination}"`,
          `  ${updates.length} import(s) to update in ${uniqueFiles.size} file(s)`,
          "",
        ];

        if (updates.length > 0) {
          lines.push("Files to update:");
          const byFile = new Map<string, FileUpdate[]>();
          for (const update of updates) {
            if (!byFile.has(update.file)) byFile.set(update.file, []);
            byFile.get(update.file)!.push(update);
          }

          for (const [file, fileUpdates] of byFile) {
            lines.push(`  ${file}:`);
            for (const u of fileUpdates) {
              lines.push(`    Line ${u.line}: "${u.oldImport}" → "${u.newImport}"`);
            }
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: {
            success: true,
            source,
            destination,
            updatedFiles: uniqueFiles.size,
            updates,
            dryRun: true,
          },
        };
      }

      // Actually perform the move
      // 1. Move the file
      const moveResult = syntax.moveFile(source, destination);
      if (!moveResult.ok) {
        return {
          content: [{ type: "text", text: `Error moving file: ${moveResult.error.message}` }],
          structuredContent: {
            success: false,
            error: `Error moving file: ${moveResult.error.message}`,
          },
        };
      }

      // 2. Update imports in other files
      const updatedFileSet = new Set<string>();
      for (const update of updates) {
        const readResult = syntax.readFile(update.file);
        if (!readResult.ok) continue;

        const content = readResult.value;
        const lines = content.split('\n');

        // Replace the import on the specific line
        const oldLine = lines[update.line - 1];
        const newLine = oldLine.replace(
          new RegExp(`(['"])${escapeRegex(update.oldImport)}(['"])`),
          `$1${update.newImport}$2`
        );

        if (newLine !== oldLine) {
          lines[update.line - 1] = newLine;
          const newContent = lines.join('\n');
          const result = syntax.writeFile(update.file, newContent);
          if (result.ok) {
            updatedFileSet.add(update.file);
          }
        }
      }

      // 3. Re-index affected files
      await index.reindexFile(destination);
      for (const file of updatedFileSet) {
        await index.reindexFile(file);
      }

      const lines: string[] = [
        `Moved "${source}" to "${destination}"`,
        `  Updated ${updates.length} import(s) in ${updatedFileSet.size} file(s)`,
        "",
      ];

      if (updatedFileSet.size > 0) {
        lines.push("Updated files:");
        for (const file of updatedFileSet) {
          lines.push(`  ${file}`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          source,
          destination,
          updatedFiles: updatedFileSet.size,
          updates,
          dryRun: false,
        },
      };
    }
  );
}

/**
 * Check if an import path resolves to the source file.
 */
function isImportFromFile(
  fromFile: string,
  importPath: string,
  sourceFile: string
): boolean {
  // Only check relative imports
  if (!importPath.startsWith('.')) {
    return false;
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, importPath));

  // Handle various import patterns
  // 1. Direct match with extension
  if (resolved === sourceFile) return true;

  // 2. Match without extension (common in TS imports)
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
  for (const ext of extensions) {
    if (resolved + ext === sourceFile) return true;
  }

  // 3. Handle .js -> .ts mapping (ESM imports use .js for .ts files)
  if (resolved.endsWith('.js')) {
    const tsPath = resolved.slice(0, -3) + '.ts';
    if (tsPath === sourceFile) return true;
    const tsxPath = resolved.slice(0, -3) + '.tsx';
    if (tsxPath === sourceFile) return true;
  }

  // 4. Handle .mjs -> .mts mapping
  if (resolved.endsWith('.mjs')) {
    const mtsPath = resolved.slice(0, -4) + '.mts';
    if (mtsPath === sourceFile) return true;
  }

  // 5. Check index file pattern
  for (const ext of extensions) {
    const indexPath = path.join(resolved, 'index' + ext);
    if (indexPath === sourceFile) return true;
  }

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * move_symbol tool - Move a symbol (function, class, etc.) from one file to another.
 * Automatically updates all imports across the codebase.
 */

import * as z from "zod/v4";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";
import { findByNamePath } from "../core/symbolTree.js";

interface MoveSymbolInput {
  source_file: string;
  symbol_name: string;
  destination_file: string;
  dry_run?: boolean;
  add_reexport?: boolean;
}

interface FileUpdate {
  file: string;
  oldImport: string;
  newImport: string;
  line: number;
}

interface MoveSymbolOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  symbol?: string;
  sourceFile?: string;
  destinationFile?: string;
  symbolCode?: string;
  updatedFiles?: number;
  updates?: FileUpdate[];
  dryRun?: boolean;
}

export function registerMoveSymbol(
  server: McpServer,
  index: ProjectIndex,
  syntax: SyntaxService
): void {
  server.registerTool(
    "move_symbol",
    {
      title: "Move symbol",
      description: `Move a symbol (function, class, interface, etc.) from one file to another.

This tool:
1. Extracts the symbol from the source file
2. Adds it to the destination file (at the end)
3. Finds all files that import this symbol from the source
4. Updates their imports to use the destination file
5. Removes the symbol from the source file
6. Optionally adds a re-export from source to destination for backwards compatibility

Use cases:
- Refactor by moving a function to a more appropriate module
- Extract a class to its own file
- Reorganize code without breaking imports

IMPORTANT: Use dry_run=true first to preview changes.`,
      inputSchema: {
        source_file: z.string().describe("Path to the file containing the symbol"),
        symbol_name: z.string().describe("Name of the symbol to move (e.g., 'myFunction' or 'MyClass')"),
        destination_file: z.string().describe("Path to the file to move the symbol to"),
        dry_run: z
          .boolean()
          .optional()
          .describe("If true, show what would change without making changes (default: false)"),
        add_reexport: z
          .boolean()
          .optional()
          .describe("If true, add a re-export from source to destination for backwards compatibility (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        symbol: z.string().optional(),
        sourceFile: z.string().optional(),
        destinationFile: z.string().optional(),
        symbolCode: z.string().optional(),
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
    async (input: MoveSymbolInput): Promise<ToolResponse<MoveSymbolOutput>> => {
      const { source_file, symbol_name, destination_file, dry_run = false, add_reexport = false } = input;

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
          },
        };
      }

      // Validate source file exists
      const sourceTree = index.getTree(source_file);
      if (!sourceTree) {
        return {
          content: [{ type: "text", text: `Error: Source file not found in index: ${source_file}` }],
          structuredContent: {
            success: false,
            error: `Source file not found in index: ${source_file}`,
          },
        };
      }

      // Read the source file
      const sourceReadResult = syntax.readFile(source_file);
      if (!sourceReadResult.ok) {
        return {
          content: [{ type: "text", text: `Error reading source file: ${sourceReadResult.error.message}` }],
          structuredContent: {
            success: false,
            error: `Error reading source file: ${sourceReadResult.error.message}`,
          },
        };
      }

      // Find the symbol in the source file
      const symbol = findByNamePath(sourceTree, symbol_name);
      if (!symbol) {
        return {
          content: [{ type: "text", text: `Error: Symbol not found in source file: ${symbol_name}` }],
          structuredContent: {
            success: false,
            error: `Symbol not found in source file: ${symbol_name}`,
          },
        };
      }

      const sourceContent = sourceReadResult.value;
      const sourceLines = sourceContent.split('\n');

      // Extract the symbol's code (including any leading comments/decorators)
      const symbolStartLine = symbol.span.start.line;
      const symbolEndLine = symbol.span.end.line;

      // Look for leading comments/decorators (up to 20 lines before)
      let actualStartLine = symbolStartLine;
      for (let i = symbolStartLine - 2; i >= Math.max(0, symbolStartLine - 20); i--) {
        const line = sourceLines[i]?.trim() || '';
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') ||
            line.startsWith('@') || line.startsWith('/**') || line === '') {
          actualStartLine = i + 1;
        } else {
          break;
        }
      }

      const symbolCode = sourceLines.slice(actualStartLine - 1, symbolEndLine).join('\n');

      // Check if symbol is exported
      const isExported = /^export\s/.test(symbolCode.trim());

      // Find all files that import this symbol from the source file
      const updates: FileUpdate[] = [];
      const indexedFiles = index.getIndexedFiles();

      // Calculate import path helper
      const calcRelativePath = (fromFile: string, toFile: string): string => {
        const fromDir = path.dirname(fromFile);
        let relative = path.relative(fromDir, toFile);

        if (!relative.startsWith('.')) {
          relative = './' + relative;
        }

        const ext = path.extname(relative);
        if (['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'].includes(ext)) {
          relative = relative.slice(0, -ext.length);
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

      // Search for imports of this symbol from the source file
      for (const file of indexedFiles) {
        if (file === source_file || file === destination_file) continue;

        const readResult = syntax.readFile(file);
        if (!readResult.ok) continue;

        const content = readResult.value;
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Match named imports: import { symbolName } from "path"
          // Also handles: import { symbolName as alias } from "path"
          const namedImportMatch = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
          if (namedImportMatch) {
            const imports = namedImportMatch[1];
            const importPath = namedImportMatch[2];

            // Check if this imports from our source file
            if (isImportFromFile(file, importPath, source_file)) {
              // Check if our symbol is in the imports
              const importedNames = imports.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
              if (importedNames.includes(symbol_name)) {
                const newImportPath = calcRelativePath(file, destination_file);
                updates.push({
                  file,
                  oldImport: importPath,
                  newImport: newImportPath,
                  line: i + 1,
                });
              }
            }
          }

          // Match default imports: import symbolName from "path"
          const defaultImportMatch = line.match(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
          if (defaultImportMatch && defaultImportMatch[1] === symbol_name) {
            const importPath = defaultImportMatch[2];
            if (isImportFromFile(file, importPath, source_file)) {
              const newImportPath = calcRelativePath(file, destination_file);
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
          `Dry run: Would move "${symbol_name}" from "${source_file}" to "${destination_file}"`,
          ``,
          `Symbol code (${symbolEndLine - actualStartLine + 1} lines):`,
          '```',
          symbolCode,
          '```',
          ``,
          `${updates.length} import(s) to update in ${uniqueFiles.size} file(s)`,
        ];

        if (updates.length > 0) {
          lines.push('', 'Files with imports to update:');
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

        if (add_reexport) {
          lines.push('', `Will add re-export to source file: export { ${symbol_name} } from "${calcRelativePath(source_file, destination_file)}"`);
        }

        return {
          content: [{ type: "text", text: lines.join('\n') }],
          structuredContent: {
            success: true,
            symbol: symbol_name,
            sourceFile: source_file,
            destinationFile: destination_file,
            symbolCode,
            updatedFiles: uniqueFiles.size,
            updates,
            dryRun: true,
          },
        };
      }

      // Actually perform the move

      // 1. Read or create destination file
      let destContent = '';
      const destExists = index.getTree(destination_file) !== null;
      if (destExists) {
        const destReadResult = syntax.readFile(destination_file);
        if (destReadResult.ok) {
          destContent = destReadResult.value;
        }
      }

      // 2. Add symbol to destination file
      // Ensure the symbol is exported (add export if not already)
      let symbolToAdd = symbolCode;
      if (!isExported) {
        // Add export keyword
        symbolToAdd = 'export ' + symbolCode;
      }

      // Add to end of file with proper spacing
      if (destContent && !destContent.endsWith('\n')) {
        destContent += '\n';
      }
      if (destContent) {
        destContent += '\n';
      }
      destContent += symbolToAdd + '\n';

      const destWriteResult = syntax.writeFile(destination_file, destContent);
      if (!destWriteResult.ok) {
        return {
          content: [{ type: "text", text: `Error writing destination file: ${destWriteResult.error.message}` }],
          structuredContent: {
            success: false,
            error: `Error writing destination file: ${destWriteResult.error.message}`,
          },
        };
      }

      // 3. Update imports in other files
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

      // 4. Remove symbol from source file (or add re-export)
      const newSourceLines = [...sourceLines];

      // Remove the symbol lines
      newSourceLines.splice(actualStartLine - 1, symbolEndLine - actualStartLine + 1);

      // Clean up extra blank lines left behind
      let cleaned = newSourceLines.join('\n');
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

      // Add re-export if requested
      if (add_reexport) {
        const reexportPath = calcRelativePath(source_file, destination_file);
        cleaned = cleaned.trimEnd() + `\n\nexport { ${symbol_name} } from "${reexportPath}";\n`;
      }

      const sourceWriteResult = syntax.writeFile(source_file, cleaned);
      if (!sourceWriteResult.ok) {
        return {
          content: [{ type: "text", text: `Error updating source file: ${sourceWriteResult.error.message}` }],
          structuredContent: {
            success: false,
            error: `Error updating source file: ${sourceWriteResult.error.message}`,
          },
        };
      }

      // 5. Re-index affected files
      await index.reindexFile(source_file);
      await index.reindexFile(destination_file);
      for (const file of updatedFileSet) {
        await index.reindexFile(file);
      }

      const outputLines: string[] = [
        `Moved "${symbol_name}" from "${source_file}" to "${destination_file}"`,
        `  Updated ${updates.length} import(s) in ${updatedFileSet.size} file(s)`,
      ];

      if (add_reexport) {
        outputLines.push(`  Added re-export to source file for backwards compatibility`);
      }

      if (updatedFileSet.size > 0) {
        outputLines.push('', 'Updated files:');
        for (const file of updatedFileSet) {
          outputLines.push(`  ${file}`);
        }
      }

      return {
        content: [{ type: "text", text: outputLines.join('\n') }],
        structuredContent: {
          success: true,
          symbol: symbol_name,
          sourceFile: source_file,
          destinationFile: destination_file,
          symbolCode,
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
  if (!importPath.startsWith('.')) {
    return false;
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, importPath));

  // Direct match with extension
  if (resolved === sourceFile) return true;

  // Match without extension
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
  for (const ext of extensions) {
    if (resolved + ext === sourceFile) return true;
  }

  // Handle .js -> .ts mapping
  if (resolved.endsWith('.js')) {
    const tsPath = resolved.slice(0, -3) + '.ts';
    if (tsPath === sourceFile) return true;
    const tsxPath = resolved.slice(0, -3) + '.tsx';
    if (tsxPath === sourceFile) return true;
  }

  // Handle .mjs -> .mts mapping
  if (resolved.endsWith('.mjs')) {
    const mtsPath = resolved.slice(0, -4) + '.mts';
    if (mtsPath === sourceFile) return true;
  }

  // Check index file pattern
  for (const ext of extensions) {
    const indexPath = path.join(resolved, 'index' + ext);
    if (indexPath === sourceFile) return true;
  }

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

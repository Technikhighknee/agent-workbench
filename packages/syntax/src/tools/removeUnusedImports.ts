/**
 * remove_unused_imports tool - Find and remove imports that aren't used in the file.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";
import type { ImportInfo } from "../core/model.js";

interface RemoveUnusedImportsInput {
  file_path: string;
  dry_run?: boolean;
}

interface UnusedImport {
  name: string;
  source: string;
  line: number;
}

interface RemoveUnusedImportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  unusedImports: UnusedImport[];
  removedCount: number;
  dryRun: boolean;
}

export function registerRemoveUnusedImports(
  server: McpServer,
  syntax: SyntaxService
): void {
  server.registerTool(
    "remove_unused_imports",
    {
      title: "Remove unused imports",
      description: `Find and remove import statements that aren't used in the file.

This tool:
1. Analyzes all imports in the file
2. Checks if each imported name is used in the code
3. Removes imports that are never referenced
4. Cleans up empty import statements

Use cases:
- Clean up after refactoring
- Reduce bundle size by removing dead imports
- Prepare code for review

IMPORTANT: Use dry_run=true first to preview what will be removed.

Limitations:
- May not detect usage in JSX attribute strings
- Dynamic property access (obj[name]) may cause false positives
- Re-exports are considered "used"`,
      inputSchema: {
        file_path: z.string().describe("Path to the file to clean up"),
        dry_run: z.boolean().optional().describe("If true, show what would be removed without making changes (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        unusedImports: z.array(z.object({
          name: z.string(),
          source: z.string(),
          line: z.number(),
        })),
        removedCount: z.number(),
        dryRun: z.boolean(),
      },
    },
    async (input: RemoveUnusedImportsInput): Promise<ToolResponse<RemoveUnusedImportsOutput>> => {
      const { file_path, dry_run = false } = input;

      // Read the file
      const readResult = syntax.readFile(file_path);
      if (!readResult.ok) {
        return {
          content: [{ type: "text", text: `Error: ${readResult.error.message}` }],
          structuredContent: {
            success: false,
            error: readResult.error.message,
            unusedImports: [],
            removedCount: 0,
            dryRun: dry_run,
          },
        };
      }

      const content = readResult.value;

      // Get imports
      const importsResult = await syntax.getImports(file_path);
      if (!importsResult.ok) {
        return {
          content: [{ type: "text", text: `Error getting imports: ${importsResult.error}` }],
          structuredContent: {
            success: false,
            error: importsResult.error,
            unusedImports: [],
            removedCount: 0,
            dryRun: dry_run,
          },
        };
      }

      const imports = importsResult.value;

      if (imports.length === 0) {
        return {
          content: [{ type: "text", text: "No imports found in this file." }],
          structuredContent: {
            success: true,
            unusedImports: [],
            removedCount: 0,
            dryRun: dry_run,
          },
        };
      }

      // Remove import statements from content for analysis
      // (so we don't match imports in the imports themselves)
      const lines = content.split('\n');
      const importLines = new Set(imports.map(i => i.line));
      const codeWithoutImports = lines
        .filter((_, i) => !importLines.has(i + 1))
        .join('\n');

      // Find unused imports
      const unusedImports: UnusedImport[] = [];

      for (const imp of imports) {
        // Skip side-effect imports
        if (imp.type === 'side_effect') continue;

        for (const binding of imp.bindings) {
          const name = binding.name;

          // Check if the name is used in the code (word boundary match)
          const isUsed = isIdentifierUsed(codeWithoutImports, name);

          if (!isUsed) {
            unusedImports.push({
              name,
              source: imp.source,
              line: imp.line,
            });
          }
        }
      }

      if (unusedImports.length === 0) {
        return {
          content: [{ type: "text", text: "No unused imports found." }],
          structuredContent: {
            success: true,
            unusedImports: [],
            removedCount: 0,
            dryRun: dry_run,
          },
        };
      }

      if (dry_run) {
        const output = [
          `Found ${unusedImports.length} unused import(s):`,
          '',
          ...unusedImports.map(u => `  Line ${u.line}: "${u.name}" from "${u.source}"`),
        ];

        return {
          content: [{ type: "text", text: output.join('\n') }],
          structuredContent: {
            success: true,
            unusedImports,
            removedCount: unusedImports.length,
            dryRun: true,
          },
        };
      }

      // Remove unused imports
      const newLines = [...lines];
      const unusedByLine = new Map<number, Set<string>>();

      for (const unused of unusedImports) {
        if (!unusedByLine.has(unused.line)) {
          unusedByLine.set(unused.line, new Set());
        }
        unusedByLine.get(unused.line)!.add(unused.name);
      }

      // Process each import line
      for (const imp of imports) {
        const unusedNames = unusedByLine.get(imp.line);
        if (!unusedNames) continue;

        const usedBindings = imp.bindings.filter(b => !unusedNames.has(b.name));

        if (usedBindings.length === 0 && imp.type !== 'side_effect') {
          // Remove the entire import line
          newLines[imp.line - 1] = '';
        } else if (usedBindings.length < imp.bindings.length) {
          // Rebuild the import with only used bindings
          const newImport = rebuildImport(imp, usedBindings);
          newLines[imp.line - 1] = newImport;
        }
      }

      // Clean up empty lines left by removed imports
      const cleanedContent = newLines
        .join('\n')
        .replace(/^\n+/, '') // Remove leading empty lines
        .replace(/\n{3,}/g, '\n\n'); // Collapse multiple empty lines

      const writeResult = syntax.writeFile(file_path, cleanedContent);

      if (!writeResult.ok) {
        return {
          content: [{ type: "text", text: `Error writing file: ${writeResult.error.message}` }],
          structuredContent: {
            success: false,
            error: writeResult.error.message,
            unusedImports,
            removedCount: 0,
            dryRun: false,
          },
        };
      }

      return {
        content: [{ type: "text", text: `Removed ${unusedImports.length} unused import(s)` }],
        structuredContent: {
          success: true,
          unusedImports,
          removedCount: unusedImports.length,
          dryRun: false,
        },
      };
    }
  );
}

/**
 * Check if an identifier is used in the code.
 */
function isIdentifierUsed(code: string, name: string): boolean {
  // Use word boundary regex to find usage
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
  return pattern.test(code);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rebuild an import statement with only the specified bindings.
 */
function rebuildImport(imp: ImportInfo, bindings: { name: string; isDefault?: boolean; originalName?: string }[]): string {
  if (bindings.length === 0) {
    return '';
  }

  const defaultBinding = bindings.find(b => b.isDefault);
  const namedBindings = bindings.filter(b => !b.isDefault);

  const parts: string[] = [];

  if (defaultBinding) {
    parts.push(defaultBinding.name);
  }

  if (imp.type === 'namespace') {
    // namespace import: import * as name from ...
    const nsBinding = bindings[0];
    return `import * as ${nsBinding.name} from "${imp.source}";`;
  }

  if (namedBindings.length > 0) {
    const namedStr = namedBindings.map(b => {
      if (b.originalName && b.originalName !== b.name) {
        return `${b.originalName} as ${b.name}`;
      }
      return b.name;
    }).join(', ');
    parts.push(`{ ${namedStr} }`);
  }

  return `import ${parts.join(', ')} from "${imp.source}";`;
}

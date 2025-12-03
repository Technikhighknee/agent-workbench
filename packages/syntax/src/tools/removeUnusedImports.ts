/**
 * remove_unused_imports tool - Find and remove imports that aren't used in the file.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { glob } from "glob";
import * as z from "zod/v4";

import type { ImportInfo } from "../core/model.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface RemoveUnusedImportsInput {
  file_path?: string;
  pattern?: string;  // Glob pattern to match multiple files
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
  filesProcessed?: number;
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
      description: `Find and remove import statements that aren't used in file(s).

Supports single file OR glob pattern for batch operations:
- file_path: Process a single file
- pattern: Process all files matching glob (e.g., "src/**/*.ts")

Use cases:
- Clean up after refactoring
- Reduce bundle size by removing dead imports
- Batch clean entire packages

IMPORTANT: Use dry_run=true first to preview what will be removed.`,
      inputSchema: {
        file_path: z.string().optional().describe("Path to a single file to clean up"),
        pattern: z.string().optional().describe("Glob pattern to match multiple files (e.g., 'src/**/*.ts')"),
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
        filesProcessed: z.number().optional(),
        dryRun: z.boolean(),
      },
    },
    async (input: RemoveUnusedImportsInput): Promise<ToolResponse<RemoveUnusedImportsOutput>> => {
      const { file_path, pattern, dry_run = false } = input;

      // Determine files to process
      let files: string[] = [];
      if (pattern) {
        files = await glob(pattern, { nodir: true, ignore: ['**/node_modules/**', '**/dist/**'] });
      } else if (file_path) {
        files = [file_path];
      } else {
        return {
          content: [{ type: "text", text: "Error: Must provide either file_path or pattern" }],
          structuredContent: {
            success: false,
            error: "Must provide either file_path or pattern",
            unusedImports: [],
            removedCount: 0,
            dryRun: dry_run,
          },
        };
      }

      // Process all files
      const allUnused: UnusedImport[] = [];
      let totalRemoved = 0;

      for (const filePath of files) {
        const result = await processFile(syntax, filePath, dry_run);
        if (result.unusedImports.length > 0) {
          allUnused.push(...result.unusedImports.map(u => ({ ...u, file: filePath })));
          totalRemoved += result.removedCount;
        }
      }

      const output = pattern
        ? `Processed ${files.length} files, removed ${totalRemoved} unused import(s)`
        : `Removed ${totalRemoved} unused import(s)`;

      return {
        content: [{ type: "text", text: output }],
        structuredContent: {
          success: true,
          unusedImports: allUnused,
          removedCount: totalRemoved,
          filesProcessed: files.length,
          dryRun: dry_run,
        },
      };
    }
  );
}

async function processFile(
  syntax: SyntaxService,
  file_path: string,
  dry_run: boolean
): Promise<{ unusedImports: UnusedImport[]; removedCount: number }> {
  // Read the file
  const readResult = syntax.readFile(file_path);
  if (!readResult.ok) {
    return { unusedImports: [], removedCount: 0 };
  }

  const content = readResult.value;

  // Get imports
  const importsResult = await syntax.getImports(file_path);
  if (!importsResult.ok) {
    return { unusedImports: [], removedCount: 0 };
  }

  const imports = importsResult.value;
  if (imports.length === 0) {
    return { unusedImports: [], removedCount: 0 };
  }

  // Remove import statements from content for analysis
  const lines = content.split('\n');
  const importLines = new Set(imports.map(i => i.line));
  const codeWithoutImports = lines
    .filter((_, i) => !importLines.has(i + 1))
    .join('\n');

  // Find unused imports
  const unusedImports: UnusedImport[] = [];

  for (const imp of imports) {
    if (imp.type === 'side_effect') continue;

    for (const binding of imp.bindings) {
      const name = binding.name;
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

  if (unusedImports.length === 0 || dry_run) {
    return { unusedImports, removedCount: unusedImports.length };
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

  for (const imp of imports) {
    const unusedNames = unusedByLine.get(imp.line);
    if (!unusedNames) continue;

    const usedBindings = imp.bindings.filter(b => !unusedNames.has(b.name));

    if (usedBindings.length === 0 && imp.type !== 'side_effect') {
      newLines[imp.line - 1] = '';
    } else if (usedBindings.length < imp.bindings.length) {
      const newImport = rebuildImport(imp, usedBindings);
      newLines[imp.line - 1] = newImport;
    }
  }

  // Clean up empty lines
  const cleanedContent = newLines
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n');

  syntax.writeFile(file_path, cleanedContent);

  return { unusedImports, removedCount: unusedImports.length };
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

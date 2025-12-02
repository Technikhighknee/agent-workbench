/**
 * organize_imports tool - Sort and group imports in a file.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";
import type { ImportInfo } from "../core/model.js";

interface OrganizeImportsInput {
  file_path: string;
  dry_run?: boolean;
  group_style?: "none" | "type" | "source";
}

interface OrganizeImportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  importCount: number;
  changes: number;
  dryRun: boolean;
  newImportBlock?: string;
}

export function registerOrganizeImports(
  server: McpServer,
  syntax: SyntaxService
): void {
  server.registerTool(
    "organize_imports",
    {
      title: "Organize imports",
      description: `Sort and organize import statements in a file.

This tool:
1. Groups imports by type (external packages, internal modules, types)
2. Sorts imports alphabetically within each group
3. Combines imports from the same source
4. Adds blank lines between groups

Grouping styles:
- "type": Group by import type (side_effect, default, named, namespace, type)
- "source": Group by source (node_modules, relative paths)
- "none": Just sort alphabetically

Use cases:
- Clean up messy import blocks
- Enforce consistent import ordering
- Prepare code for review`,
      inputSchema: {
        file_path: z.string().describe("Path to the file to organize"),
        dry_run: z.boolean().optional().describe("If true, show what would change without making changes (default: false)"),
        group_style: z.enum(["none", "type", "source"]).optional().describe("How to group imports (default: 'source')"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        importCount: z.number(),
        changes: z.number(),
        dryRun: z.boolean(),
        newImportBlock: z.string().optional(),
      },
    },
    async (input: OrganizeImportsInput): Promise<ToolResponse<OrganizeImportsOutput>> => {
      const { file_path, dry_run = false, group_style = "source" } = input;

      // Read the file
      const readResult = syntax.readFile(file_path);
      if (!readResult.ok) {
        return {
          content: [{ type: "text", text: `Error: ${readResult.error.message}` }],
          structuredContent: {
            success: false,
            error: readResult.error.message,
            importCount: 0,
            changes: 0,
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
            importCount: 0,
            changes: 0,
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
            importCount: 0,
            changes: 0,
            dryRun: dry_run,
          },
        };
      }

      // Organize imports
      const organizedImports = organizeImportStatements(imports, group_style);
      const newImportBlock = organizedImports.join('\n');

      // Find the import block in the original file
      const lines = content.split('\n');
      const importLines = imports.map(i => i.line).sort((a, b) => a - b);
      const firstImportLine = importLines[0] - 1;
      const lastImportLine = importLines[importLines.length - 1];

      // Check if anything changed
      const oldImportBlock = lines.slice(firstImportLine, lastImportLine).join('\n');
      if (oldImportBlock.trim() === newImportBlock.trim()) {
        return {
          content: [{ type: "text", text: "Imports are already organized." }],
          structuredContent: {
            success: true,
            importCount: imports.length,
            changes: 0,
            dryRun: dry_run,
          },
        };
      }

      if (dry_run) {
        const output = [
          `Would reorganize ${imports.length} import(s):`,
          '',
          'New import block:',
          '```',
          newImportBlock,
          '```',
        ];

        return {
          content: [{ type: "text", text: output.join('\n') }],
          structuredContent: {
            success: true,
            importCount: imports.length,
            changes: imports.length,
            dryRun: true,
            newImportBlock,
          },
        };
      }

      // Replace the import block
      const newLines = [
        ...lines.slice(0, firstImportLine),
        ...organizedImports,
        ...lines.slice(lastImportLine),
      ];

      const newContent = newLines.join('\n');
      const writeResult = syntax.writeFile(file_path, newContent);

      if (!writeResult.ok) {
        return {
          content: [{ type: "text", text: `Error writing file: ${writeResult.error.message}` }],
          structuredContent: {
            success: false,
            error: writeResult.error.message,
            importCount: imports.length,
            changes: 0,
            dryRun: false,
          },
        };
      }

      return {
        content: [{ type: "text", text: `Organized ${imports.length} import(s)` }],
        structuredContent: {
          success: true,
          importCount: imports.length,
          changes: imports.length,
          dryRun: false,
          newImportBlock,
        },
      };
    }
  );
}

/**
 * Organize import statements by grouping and sorting.
 */
function organizeImportStatements(
  imports: ImportInfo[],
  style: "none" | "type" | "source"
): string[] {
  // Combine imports from same source
  const bySource = new Map<string, ImportInfo[]>();
  for (const imp of imports) {
    if (!bySource.has(imp.source)) {
      bySource.set(imp.source, []);
    }
    bySource.get(imp.source)!.push(imp);
  }

  // Build combined import statements
  interface CombinedImport {
    source: string;
    statement: string;
    isExternal: boolean;
    isType: boolean;
    isSideEffect: boolean;
  }

  const combined: CombinedImport[] = [];

  for (const [source, sourceImports] of bySource) {
    const isExternal = !source.startsWith('.') && !source.startsWith('/');
    const isSideEffect = sourceImports.every(i => i.type === 'side_effect');
    const hasTypeOnly = sourceImports.some(i => i.raw.includes('import type'));

    if (isSideEffect) {
      combined.push({
        source,
        statement: `import "${source}";`,
        isExternal,
        isType: false,
        isSideEffect: true,
      });
      continue;
    }

    // Collect all bindings
    // Default imports have type 'default' and only one binding
    const defaultImportInfo = sourceImports.find(i => i.type === 'default');
    const defaultImport = defaultImportInfo?.bindings[0]?.name;

    const namespaceImport = sourceImports
      .find(i => i.type === 'namespace')
      ?.bindings[0]?.name;

    // Named imports come from imports with type 'named' or 'type'
    const namedImports = sourceImports
      .filter(i => i.type !== 'default' && i.type !== 'namespace' && i.type !== 'side_effect')
      .flatMap(i => i.bindings)
      .map(b => {
        if (b.originalName && b.originalName !== b.name) {
          return `${b.originalName} as ${b.name}`;
        }
        return b.name;
      })
      .filter((v, i, a) => a.indexOf(v) === i) // dedupe
      .sort();

    // Build statement
    let statement: string;
    const typePrefix = hasTypeOnly ? 'type ' : '';

    if (namespaceImport) {
      statement = `import ${typePrefix}* as ${namespaceImport} from "${source}";`;
    } else {
      const parts: string[] = [];
      if (defaultImport) parts.push(defaultImport);
      if (namedImports.length > 0) parts.push(`{ ${namedImports.join(', ')} }`);
      statement = `import ${typePrefix}${parts.join(', ')} from "${source}";`;
    }

    combined.push({
      source,
      statement,
      isExternal,
      isType: hasTypeOnly,
      isSideEffect: false,
    });
  }

  // Sort based on style
  if (style === "none") {
    combined.sort((a, b) => a.source.localeCompare(b.source));
    return combined.map(c => c.statement);
  }

  if (style === "source") {
    // Group: side-effects, external, internal
    const sideEffects = combined.filter(c => c.isSideEffect);
    const external = combined.filter(c => c.isExternal && !c.isSideEffect);
    const internal = combined.filter(c => !c.isExternal && !c.isSideEffect);

    sideEffects.sort((a, b) => a.source.localeCompare(b.source));
    external.sort((a, b) => a.source.localeCompare(b.source));
    internal.sort((a, b) => a.source.localeCompare(b.source));

    const result: string[] = [];
    if (sideEffects.length > 0) {
      result.push(...sideEffects.map(c => c.statement));
    }
    if (external.length > 0) {
      if (result.length > 0) result.push('');
      result.push(...external.map(c => c.statement));
    }
    if (internal.length > 0) {
      if (result.length > 0) result.push('');
      result.push(...internal.map(c => c.statement));
    }
    return result;
  }

  if (style === "type") {
    // Group: side-effects, regular, type-only
    const sideEffects = combined.filter(c => c.isSideEffect);
    const regular = combined.filter(c => !c.isSideEffect && !c.isType);
    const typeOnly = combined.filter(c => c.isType);

    sideEffects.sort((a, b) => a.source.localeCompare(b.source));
    regular.sort((a, b) => a.source.localeCompare(b.source));
    typeOnly.sort((a, b) => a.source.localeCompare(b.source));

    const result: string[] = [];
    if (sideEffects.length > 0) {
      result.push(...sideEffects.map(c => c.statement));
    }
    if (regular.length > 0) {
      if (result.length > 0) result.push('');
      result.push(...regular.map(c => c.statement));
    }
    if (typeOnly.length > 0) {
      if (result.length > 0) result.push('');
      result.push(...typeOnly.map(c => c.statement));
    }
    return result;
  }

  return combined.map(c => c.statement);
}

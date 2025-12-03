/**
 * organize_imports tool - Sort and group imports in a file.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { glob } from "glob";
import * as z from "zod/v4";

import type { ImportInfo } from "../core/model.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface OrganizeImportsInput {
  file_path?: string;
  pattern?: string;
  dry_run?: boolean;
  group_style?: "none" | "type" | "source";
}

interface OrganizeImportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  importCount: number;
  changes: number;
  filesProcessed?: number;
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
      description: `Sort and organize import statements in file(s).

Supports single file OR glob pattern for batch operations:
- file_path: Process a single file
- pattern: Process all files matching glob (e.g., "src/**/*.ts")

Grouping styles:
- "source": Group by source (external first, then internal)
- "type": Group by import type (regular, then type-only)
- "none": Just sort alphabetically`,
      inputSchema: {
        file_path: z.string().optional().describe("Path to a single file to organize"),
        pattern: z.string().optional().describe("Glob pattern to match multiple files (e.g., 'src/**/*.ts')"),
        dry_run: z.boolean().optional().describe("If true, show what would change without making changes (default: false)"),
        group_style: z.enum(["none", "type", "source"]).optional().describe("How to group imports (default: 'source')"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        importCount: z.number(),
        changes: z.number(),
        filesProcessed: z.number().optional(),
        dryRun: z.boolean(),
        newImportBlock: z.string().optional(),
      },
    },
    async (input: OrganizeImportsInput): Promise<ToolResponse<OrganizeImportsOutput>> => {
      const { file_path, pattern, dry_run = false, group_style = "source" } = input;

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
            importCount: 0,
            changes: 0,
            dryRun: dry_run,
          },
        };
      }

      // Process all files
      let totalImports = 0;
      let totalChanges = 0;

      for (const filePath of files) {
        const result = await processFileOrganize(syntax, filePath, dry_run, group_style);
        totalImports += result.importCount;
        totalChanges += result.changes;
      }

      const output = pattern
        ? `Processed ${files.length} files, organized ${totalChanges} import block(s)`
        : `Organized ${totalImports} import(s)`;

      return {
        content: [{ type: "text", text: output }],
        structuredContent: {
          success: true,
          importCount: totalImports,
          changes: totalChanges,
          filesProcessed: files.length,
          dryRun: dry_run,
        },
      };
    }
  );
}

async function processFileOrganize(
  syntax: SyntaxService,
  file_path: string,
  dry_run: boolean,
  group_style: "none" | "type" | "source"
): Promise<{ importCount: number; changes: number }> {
  const readResult = syntax.readFile(file_path);
  if (!readResult.ok) {
    return { importCount: 0, changes: 0 };
  }

  const content = readResult.value;
  const importsResult = await syntax.getImports(file_path);
  if (!importsResult.ok) {
    return { importCount: 0, changes: 0 };
  }

  const imports = importsResult.value;
  if (imports.length === 0) {
    return { importCount: 0, changes: 0 };
  }

  const organizedImports = organizeImportStatements(imports, group_style);
  const newImportBlock = organizedImports.join('\n');

  const lines = content.split('\n');
  const importLines = imports.map(i => i.line).sort((a, b) => a - b);
  const firstImportLine = importLines[0] - 1;
  const lastImportLine = importLines[importLines.length - 1];

  const oldImportBlock = lines.slice(firstImportLine, lastImportLine).join('\n');
  if (oldImportBlock.trim() === newImportBlock.trim()) {
    return { importCount: imports.length, changes: 0 };
  }

  if (dry_run) {
    return { importCount: imports.length, changes: imports.length };
  }

  const newLines = [
    ...lines.slice(0, firstImportLine),
    ...organizedImports,
    ...lines.slice(lastImportLine),
  ];

  syntax.writeFile(file_path, newLines.join('\n'));
  return { importCount: imports.length, changes: imports.length };
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

    // Collect all bindings with their type info
    const defaultImportInfo = sourceImports.find(i => i.type === 'default');
    const defaultBinding = defaultImportInfo?.bindings[0];

    const namespaceImportInfo = sourceImports.find(i => i.type === 'namespace');
    const namespaceBinding = namespaceImportInfo?.bindings[0];

    // Collect named bindings with isType flag preserved
    const namedBindings = sourceImports
      .filter(i => i.type !== 'default' && i.type !== 'namespace' && i.type !== 'side_effect')
      .flatMap(i => i.bindings)
      .filter((b, i, arr) => arr.findIndex(x => x.name === b.name) === i); // dedupe by name

    // Separate type-only and value bindings
    const typeBindings = namedBindings.filter(b => b.isType);
    const valueBindings = namedBindings.filter(b => !b.isType);

    // Check if all imports are type-only
    const allTypeOnly = valueBindings.length === 0 &&
      (!defaultBinding || defaultBinding.isType) &&
      (!namespaceBinding || namespaceBinding.isType);

    // Build statement with inline type syntax when mixing types and values
    const formatBinding = (b: { name: string; originalName?: string; isType?: boolean }, forceType = false) => {
      const typePrefix = (b.isType || forceType) && !allTypeOnly ? 'type ' : '';
      if (b.originalName && b.originalName !== b.name) {
        return `${typePrefix}${b.originalName} as ${b.name}`;
      }
      return `${typePrefix}${b.name}`;
    };

    let statement: string;
    const importKeyword = allTypeOnly ? 'import type' : 'import';

    if (namespaceBinding) {
      statement = `${importKeyword} * as ${namespaceBinding.name} from "${source}";`;
    } else {
      const parts: string[] = [];

      // Default import first
      if (defaultBinding) {
        parts.push(formatBinding(defaultBinding));
      }

      // Named imports - combine and sort (values first, then types)
      const allNamed = [...valueBindings, ...typeBindings]
        .map(b => formatBinding(b))
        .sort((a, b) => {
          // Sort type imports after value imports
          const aIsType = a.startsWith('type ');
          const bIsType = b.startsWith('type ');
          if (aIsType !== bIsType) return aIsType ? 1 : -1;
          return a.localeCompare(b);
        });

      if (allNamed.length > 0) {
        parts.push(`{ ${allNamed.join(', ')} }`);
      }

      statement = `${importKeyword} ${parts.join(', ')} from "${source}";`;
    }

    combined.push({
      source,
      statement,
      isExternal,
      isType: allTypeOnly,
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

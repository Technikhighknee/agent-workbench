/**
 * find_unused_exports tool - Find exports that are not imported anywhere in the codebase.
 * Helps identify dead code and unused public APIs.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as path from "path";
import * as z from "zod/v4";

import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface FindUnusedExportsInput {
  file_pattern?: string;
  include_reexports?: boolean;
  include_config?: boolean;
  include_fixtures?: boolean;
  exclude_patterns?: string[];
}

interface UnusedExport {
  file: string;
  name: string;
  kind: string;
  line: number;
  isDefault: boolean;
}

interface FindUnusedExportsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  unusedExports: UnusedExport[];
  totalExports: number;
  totalUnused: number;
  filesAnalyzed: number;
}

/**
 * Convert a glob pattern to a regex for matching file paths.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/**
 * Check if a file path matches any of the given glob patterns.
 */
function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regex = globToRegex(pattern);
    return regex.test(filePath);
  });
}

export function registerFindUnusedExports(
  server: McpServer,
  index: ProjectIndex,
  syntax: SyntaxService
): void {
  server.registerTool(
    "find_unused_exports",
    {
      title: "Find unused exports",
      description: `Find exports that are not imported anywhere in the codebase.

This tool helps identify dead code by finding:
- Exported functions that are never called
- Exported classes that are never instantiated
- Exported types/interfaces that are never used
- Exported constants that are never referenced

By default, excludes noise like config files and test fixtures.

Use cases:
- Clean up dead code before refactoring
- Identify unused public APIs
- Find leftover exports after removing features
- Reduce bundle size by removing unused code

Note: This checks imports within the indexed project only.
Exports used by external packages or entry points (like main exports) may be flagged.`,
      inputSchema: {
        file_pattern: z
          .string()
          .optional()
          .describe(
            "Optional glob pattern to filter files (e.g., 'src/**/*.ts')"
          ),
        include_reexports: z
          .boolean()
          .optional()
          .describe(
            "Include re-exports (export { x } from './y') in results (default: false)"
          ),
        include_config: z
          .boolean()
          .optional()
          .describe(
            "Include config files like *.config.ts, vitest.workspace.ts (default: false)"
          ),
        include_fixtures: z
          .boolean()
          .optional()
          .describe(
            "Include test fixture files in test/fixtures/** (default: false)"
          ),
        exclude_patterns: z
          .array(z.string())
          .optional()
          .describe(
            "Additional glob patterns to exclude (e.g., ['**/generated/**'])"
          ),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        unusedExports: z.array(
          z.object({
            file: z.string(),
            name: z.string(),
            kind: z.string(),
            line: z.number(),
            isDefault: z.boolean(),
          })
        ),
        totalExports: z.number(),
        totalUnused: z.number(),
        filesAnalyzed: z.number(),
      },
    },
    async (
      input: FindUnusedExportsInput
    ): Promise<ToolResponse<FindUnusedExportsOutput>> => {
      const {
        file_pattern,
        include_reexports = false,
        include_config = false,
        include_fixtures = false,
        exclude_patterns = [],
      } = input;

      if (index.isEmpty()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No project indexed. Call index_project first.",
            },
          ],
          structuredContent: {
            success: false,
            error: "No project indexed. Call index_project first.",
            unusedExports: [],
            totalExports: 0,
            totalUnused: 0,
            filesAnalyzed: 0,
          },
        };
      }

      const indexedFiles = index.getIndexedFiles();

      // Filter files
      let filesToAnalyze = indexedFiles;

      // Apply include pattern first
      if (file_pattern) {
        const regex = globToRegex(file_pattern);
        filesToAnalyze = filesToAnalyze.filter((f) => regex.test(f));
      }

      // Apply exclusions
      const originalCount = filesToAnalyze.length;
      filesToAnalyze = filesToAnalyze.filter((f) => {
        // Exclude config files by substring match
        if (!include_config) {
          if (
            f.endsWith(".config.ts") ||
            f.endsWith(".config.js") ||
            f.endsWith(".config.mts") ||
            f.endsWith(".config.mjs") ||
            f.includes("vitest.workspace.")
          ) {
            return false;
          }
        }

        // Exclude fixture files by substring match
        if (!include_fixtures) {
          if (
            f.includes("/test/fixtures/") ||
            f.includes("/tests/fixtures/") ||
            f.includes("/__fixtures__/") ||
            f.includes("/fixtures/")
          ) {
            return false;
          }
        }

        // Exclude by custom patterns
        if (
          exclude_patterns.length > 0 &&
          matchesAnyPattern(f, exclude_patterns)
        ) {
          return false;
        }
        return true;
      });
      const filesExcluded = originalCount - filesToAnalyze.length;

      // Step 1: Collect all exports from all files
      interface ExportInfo {
        file: string;
        name: string;
        kind: string;
        line: number;
        isDefault: boolean;
        isReexport: boolean;
      }

      const allExports: ExportInfo[] = [];
      const exportMap = new Map<string, ExportInfo[]>(); // file -> exports

      for (const file of filesToAnalyze) {
        const exportsResult = await syntax.getExports(file);
        if (!exportsResult.ok) continue;

        const fileExports: ExportInfo[] = [];
        for (const exp of exportsResult.value) {
          const isReexport = exp.source !== undefined;

          if (!include_reexports && isReexport) continue;

          for (const binding of exp.bindings) {
            fileExports.push({
              file,
              name: binding.name,
              kind: exp.type, // export type (named, default, declaration, etc.)
              line: exp.line,
              isDefault: exp.type === "default",
              isReexport,
            });
          }
        }

        allExports.push(...fileExports);
        exportMap.set(file, fileExports);
      }

      // Step 2: Collect all imports from all files
      const importedSymbols = new Set<string>(); // "file:name" format
      const importedFromFile = new Map<string, Set<string>>(); // file -> set of names

      for (const file of indexedFiles) {
        const importsResult = await syntax.getImports(file);
        if (!importsResult.ok) continue;

        for (const imp of importsResult.value) {
          // Resolve the import source to a file path
          const resolvedFile = resolveImportPath(
            file,
            imp.source,
            indexedFiles
          );
          if (!resolvedFile) continue;

          if (!importedFromFile.has(resolvedFile)) {
            importedFromFile.set(resolvedFile, new Set());
          }

          for (const binding of imp.bindings) {
            const name = binding.name;
            importedSymbols.add(`${resolvedFile}:${name}`);
            importedFromFile.get(resolvedFile)!.add(name);
          }
        }
      }

      // Step 3: Find unused exports
      const unusedExports: UnusedExport[] = [];

      for (const exp of allExports) {
        const key = `${exp.file}:${exp.name}`;
        const isUsed = importedSymbols.has(key);

        if (!isUsed) {
          // Skip index.ts/index.js barrel exports (they're often entry points)
          const basename = path.basename(exp.file);
          if (basename === "index.ts" || basename === "index.js") {
            continue;
          }

          // Skip main entry points (package.json main/exports)
          // This is a heuristic - files named after the package are often entry points
          const filename = path.basename(exp.file, path.extname(exp.file));
          if (
            filename === "main" ||
            filename === "index" ||
            filename === "server"
          ) {
            continue;
          }

          unusedExports.push({
            file: exp.file,
            name: exp.name,
            kind: exp.kind,
            line: exp.line,
            isDefault: exp.isDefault,
          });
        }
      }

      // Sort by file, then by line
      unusedExports.sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.line - b.line;
      });

      // Build output
      const lines: string[] = [
        `Found ${unusedExports.length} unused export(s) out of ${allExports.length} total export(s)`,
        `Analyzed ${filesToAnalyze.length} file(s)${filesExcluded > 0 ? `, excluded ${filesExcluded} file(s)` : ""}`,
        "",
      ];

      if (unusedExports.length > 0) {
        lines.push("Unused exports:");

        let currentFile = "";
        for (const exp of unusedExports) {
          if (exp.file !== currentFile) {
            currentFile = exp.file;
            lines.push(`\n  ${exp.file}:`);
          }
          const defaultMarker = exp.isDefault ? " (default)" : "";
          lines.push(
            `    Line ${exp.line}: ${exp.name} [${exp.kind}]${defaultMarker}`
          );
        }
      } else {
        lines.push(
          "No unused exports found - all exports are imported somewhere."
        );
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: true,
          unusedExports,
          totalExports: allExports.length,
          totalUnused: unusedExports.length,
          filesAnalyzed: filesToAnalyze.length,
        },
      };
    }
  );
}

/**
 * Resolve an import path to an actual file path.
 */
function resolveImportPath(
  fromFile: string,
  importPath: string,
  indexedFiles: string[]
): string | null {
  // Only handle relative imports
  if (!importPath.startsWith(".")) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(fromDir, importPath));

  // Try various extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

  // Direct match
  if (indexedFiles.includes(resolved)) return resolved;

  // With extension
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (indexedFiles.includes(withExt)) return withExt;
  }

  // Handle .js -> .ts mapping
  if (resolved.endsWith(".js")) {
    const tsPath = resolved.slice(0, -3) + ".ts";
    if (indexedFiles.includes(tsPath)) return tsPath;
    const tsxPath = resolved.slice(0, -3) + ".tsx";
    if (indexedFiles.includes(tsxPath)) return tsxPath;
  }

  // Handle .mjs -> .mts mapping
  if (resolved.endsWith(".mjs")) {
    const mtsPath = resolved.slice(0, -4) + ".mts";
    if (indexedFiles.includes(mtsPath)) return mtsPath;
  }

  // Index file pattern
  for (const ext of extensions) {
    const indexPath = path.join(resolved, "index" + ext);
    if (indexedFiles.includes(indexPath)) return indexPath;
  }

  return null;
}

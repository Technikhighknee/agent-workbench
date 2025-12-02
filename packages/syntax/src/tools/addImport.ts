/**
 * add_import tool - Add an import statement to a file.
 * Handles merging with existing imports from the same source.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface AddImportInput {
  file_path: string;
  source: string;
  names?: string[];
  default_import?: string;
  namespace_import?: string;
  type_only?: boolean;
}

interface AddImportOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  action?: "added" | "merged" | "already_exists";
  importStatement?: string;
}

export function registerAddImport(server: McpServer, syntax: SyntaxService): void {
  server.registerTool(
    "add_import",
    {
      title: "Add import",
      description: `Add an import statement to a file, intelligently merging with existing imports.

Features:
- Adds named imports: import { foo, bar } from "source"
- Adds default imports: import Foo from "source"
- Adds namespace imports: import * as foo from "source"
- Merges with existing imports from the same source
- Supports type-only imports

Use cases:
- Add imports after moving/extracting code
- Quick import insertion without manual editing
- Ensure consistent import style`,
      inputSchema: {
        file_path: z.string().describe("Path to the file to add import to"),
        source: z.string().describe("Import source (e.g., './utils', 'lodash', '@org/pkg')"),
        names: z
          .array(z.string())
          .optional()
          .describe("Named imports to add (e.g., ['foo', 'bar'])"),
        default_import: z.string().optional().describe("Default import name (e.g., 'Foo')"),
        namespace_import: z.string().optional().describe("Namespace import name (e.g., 'foo' for 'import * as foo')"),
        type_only: z.boolean().optional().describe("Whether this is a type-only import (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        action: z.enum(["added", "merged", "already_exists"]).optional(),
        importStatement: z.string().optional(),
      },
    },
    async (input: AddImportInput): Promise<ToolResponse<AddImportOutput>> => {
      const { file_path, source, names = [], default_import, namespace_import, type_only = false } = input;

      // Validate input
      if (!names.length && !default_import && !namespace_import) {
        return {
          content: [{ type: "text", text: "Error: Must specify at least one of: names, default_import, or namespace_import" }],
          structuredContent: { success: false, error: "No imports specified" },
        };
      }

      // Read the file
      const readResult = syntax.readFile(file_path);
      if (!readResult.ok) {
        return {
          content: [{ type: "text", text: `Error: ${readResult.error.message}` }],
          structuredContent: { success: false, error: readResult.error.message },
        };
      }

      const content = readResult.value;
      const lines = content.split('\n');

      // Get existing imports
      const importsResult = await syntax.getImports(file_path);
      const existingImports = importsResult.ok ? importsResult.value : [];

      // Check if import from this source already exists
      const existingFromSource = existingImports.filter(imp => imp.source === source);

      let action: "added" | "merged" | "already_exists" = "added";
      let importStatement: string;

      if (existingFromSource.length > 0) {
        // Merge with existing import
        const existingImport = existingFromSource[0];
        const existingNames = existingImport.bindings.map(b => b.name);

        // Check if all requested names already exist
        const newNames = names.filter(n => !existingNames.includes(n));
        const hasNewDefault = default_import && existingImport.type !== 'default';
        const hasNewNamespace = namespace_import && existingImport.type !== 'namespace';

        if (!newNames.length && !hasNewDefault && !hasNewNamespace) {
          return {
            content: [{ type: "text", text: `Import(s) already exist from "${source}"` }],
            structuredContent: {
              success: true,
              action: "already_exists",
              importStatement: existingImport.raw,
            },
          };
        }

        // Build merged import
        // For default imports, the binding name is the default import
        const existingDefaultName = existingImport.type === 'default' ? existingImport.bindings[0]?.name : undefined;
        const allNames = [...existingNames, ...newNames].filter(n => n !== existingDefaultName);
        const allNamedImports = allNames.filter(n => n !== default_import);

        importStatement = buildImportStatement({
          source,
          names: allNamedImports,
          defaultImport: default_import || existingDefaultName,
          namespaceImport: namespace_import,
          typeOnly: type_only,
        });

        // Replace the existing import line
        lines[existingImport.line - 1] = importStatement;
        action = "merged";
      } else {
        // Add new import
        importStatement = buildImportStatement({
          source,
          names,
          defaultImport: default_import,
          namespaceImport: namespace_import,
          typeOnly: type_only,
        });

        // Find where to insert (after last import, or at start if no imports)
        let insertLine = 0;
        if (existingImports.length > 0) {
          const lastImportLine = Math.max(...existingImports.map(i => i.line));
          insertLine = lastImportLine;
        }

        // Insert the new import
        lines.splice(insertLine, 0, importStatement);
      }

      // Write the file
      const newContent = lines.join('\n');
      const writeResult = syntax.writeFile(file_path, newContent);

      if (!writeResult.ok) {
        return {
          content: [{ type: "text", text: `Error writing file: ${writeResult.error.message}` }],
          structuredContent: { success: false, error: writeResult.error.message },
        };
      }

      const actionText = action === "merged" ? "Merged with existing import" : "Added import";
      return {
        content: [{ type: "text", text: `${actionText}: ${importStatement}` }],
        structuredContent: {
          success: true,
          action,
          importStatement,
        },
      };
    }
  );
}

function buildImportStatement(opts: {
  source: string;
  names: string[];
  defaultImport?: string;
  namespaceImport?: string;
  typeOnly: boolean;
}): string {
  const { source, names, defaultImport, namespaceImport, typeOnly } = opts;

  const typePrefix = typeOnly ? "type " : "";
  const parts: string[] = [];

  if (defaultImport) {
    parts.push(defaultImport);
  }

  if (namespaceImport) {
    parts.push(`* as ${namespaceImport}`);
  } else if (names.length > 0) {
    parts.push(`{ ${names.join(", ")} }`);
  }

  if (parts.length === 0) {
    // Side-effect import
    return `import "${source}";`;
  }

  return `import ${typePrefix}${parts.join(", ")} from "${source}";`;
}

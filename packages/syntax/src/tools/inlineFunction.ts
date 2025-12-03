/**
 * inline_function tool - Replace a function call with the function body.
 * The opposite of extract_function.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { SyntaxService } from "../core/services/SyntaxService.js";
import { findByNamePath } from "../core/symbolTree.js";
import type { ToolResponse } from "./types.js";

interface InlineFunctionInput {
  file_path: string;
  line: number;
  dry_run?: boolean;
}

interface InlineFunctionOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  functionName?: string;
  originalCall?: string;
  inlinedCode?: string;
  dryRun?: boolean;
}

export function registerInlineFunction(
  server: McpServer,
  index: ProjectIndex,
  syntax: SyntaxService
): void {
  server.registerTool(
    "inline_function",
    {
      title: "Inline function",
      description: `Replace a function call with the function body.

This is the reverse of extract_function. It takes a function call and replaces it with the actual function body, substituting parameters appropriately.

Use cases:
- Eliminate unnecessary indirection
- Prepare for further refactoring
- Simplify code by removing trivial helper functions

Limitations:
- Function must be defined in the indexed project
- Complex parameter patterns may not be handled correctly
- Functions with multiple return statements need manual cleanup

IMPORTANT: Use dry_run=true first to preview the inlining.`,
      inputSchema: {
        file_path: z.string().describe("Path to the file containing the function call"),
        line: z.number().describe("Line number of the function call (1-indexed)"),
        dry_run: z
          .boolean()
          .optional()
          .describe("If true, show what would change without making changes (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        functionName: z.string().optional(),
        originalCall: z.string().optional(),
        inlinedCode: z.string().optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (input: InlineFunctionInput): Promise<ToolResponse<InlineFunctionOutput>> => {
      const { file_path, line, dry_run = false } = input;

      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Project is auto-indexed on startup." }],
          structuredContent: {
            success: false,
            error: "No project indexed.",
          },
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

      if (line < 1 || line > lines.length) {
        return {
          content: [{ type: "text", text: `Error: Line ${line} is out of range` }],
          structuredContent: { success: false, error: `Line ${line} is out of range` },
        };
      }

      const targetLine = lines[line - 1];

      // Parse the function call from the line
      // Match patterns like: result = funcName(args) or funcName(args) or await funcName(args)
      const callMatch = targetLine.match(
        /(?:(?:const|let|var)\s+(\w+)\s*=\s*)?(?:await\s+)?(\w+)\s*\(([^)]*)\)/
      );

      if (!callMatch) {
        return {
          content: [{ type: "text", text: `Error: No function call found on line ${line}` }],
          structuredContent: { success: false, error: `No function call found on line ${line}` },
        };
      }

      const resultVar = callMatch[1] || null;
      const functionName = callMatch[2];
      const argsString = callMatch[3];

      // Parse arguments (simple split, doesn't handle nested calls well)
      const callArgs = argsString
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);

      // Find the function definition in the index
      const indexedFiles = index.getIndexedFiles();
      let functionDef: { file: string; body: string; params: string[] } | null = null;

      for (const file of indexedFiles) {
        const tree = index.getTree(file);
        if (!tree) continue;

        const symbol = findByNamePath(tree, functionName);
        if (symbol && ['function', 'method'].includes(symbol.kind)) {
          // Read the function body
          const fileReadResult = syntax.readFile(file);
          if (!fileReadResult.ok) continue;

          const fileContent = fileReadResult.value;
          const fileLines = fileContent.split('\n');
          const funcLines = fileLines.slice(symbol.span.start.line - 1, symbol.span.end.line);
          const funcBody = funcLines.join('\n');

          // Extract parameters from function signature
          const paramMatch = funcBody.match(/\(([^)]*)\)/);
          const params = paramMatch
            ? paramMatch[1].split(',').map(p => {
                // Extract parameter name (ignore type annotations)
                const nameMatch = p.trim().match(/^(\w+)/);
                return nameMatch ? nameMatch[1] : '';
              }).filter(p => p.length > 0)
            : [];

          // Extract function body (between { and })
          const bodyMatch = funcBody.match(/\{([\s\S]*)\}$/);
          if (bodyMatch) {
            functionDef = {
              file,
              body: bodyMatch[1].trim(),
              params,
            };
            break;
          }
        }
      }

      if (!functionDef) {
        return {
          content: [{ type: "text", text: `Error: Function "${functionName}" not found in indexed project` }],
          structuredContent: { success: false, error: `Function "${functionName}" not found` },
        };
      }

      // Substitute parameters
      let inlinedBody = functionDef.body;

      for (let i = 0; i < functionDef.params.length; i++) {
        const param = functionDef.params[i];
        const arg = callArgs[i] || 'undefined';

        // Replace parameter with argument (word boundary match)
        inlinedBody = inlinedBody.replace(
          new RegExp(`\\b${param}\\b`, 'g'),
          arg
        );
      }

      // Handle return statement
      if (resultVar) {
        // Replace "return X;" with assignment
        inlinedBody = inlinedBody.replace(
          /return\s+([^;]+);?/g,
          `const ${resultVar} = $1;`
        );
      } else {
        // Just remove return statements (keep the expression for side effects)
        inlinedBody = inlinedBody.replace(/return\s+/g, '');
      }

      // Get the indentation of the original line
      const indentMatch = targetLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';

      // Indent the inlined body
      const inlinedLines = inlinedBody.split('\n').map(l => {
        if (l.trim() === '') return '';
        return indent + l.trimStart();
      });
      const inlinedCode = inlinedLines.join('\n').trim();

      if (dry_run) {
        const output = [
          `Dry run: Inline function "${functionName}" at line ${line}`,
          '',
          'Original call:',
          '```',
          targetLine,
          '```',
          '',
          `Function found in: ${functionDef.file}`,
          `Parameters: ${functionDef.params.join(', ') || '(none)'}`,
          `Arguments: ${callArgs.join(', ') || '(none)'}`,
          '',
          'Inlined code:',
          '```',
          inlinedCode,
          '```',
        ];

        return {
          content: [{ type: "text", text: output.join('\n') }],
          structuredContent: {
            success: true,
            functionName,
            originalCall: targetLine.trim(),
            inlinedCode,
            dryRun: true,
          },
        };
      }

      // Replace the line with inlined code
      lines[line - 1] = indent + inlinedCode;
      const newContent = lines.join('\n');

      const writeResult = syntax.writeFile(file_path, newContent);
      if (!writeResult.ok) {
        return {
          content: [{ type: "text", text: `Error writing file: ${writeResult.error.message}` }],
          structuredContent: { success: false, error: writeResult.error.message },
        };
      }

      return {
        content: [{ type: "text", text: `Inlined function "${functionName}" at line ${line}` }],
        structuredContent: {
          success: true,
          functionName,
          originalCall: targetLine.trim(),
          inlinedCode,
          dryRun: false,
        },
      };
    }
  );
}

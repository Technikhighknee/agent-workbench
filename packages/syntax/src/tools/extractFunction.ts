/**
 * extract_function tool - Extract a range of lines into a new function.
 * Automatically detects parameters and return values.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { SyntaxService } from "../core/services/SyntaxService.js";
import type { ToolResponse } from "./types.js";

interface ExtractFunctionInput {
  file_path: string;
  start_line: number;
  end_line: number;
  function_name: string;
  dry_run?: boolean;
}

interface ExtractFunctionOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  functionName?: string;
  extractedCode?: string;
  generatedFunction?: string;
  callSite?: string;
  startLine?: number;
  endLine?: number;
  dryRun?: boolean;
}

export function registerExtractFunction(
  server: McpServer,
  syntax: SyntaxService
): void {
  server.registerTool(
    "extract_function",
    {
      title: "Extract function",
      description: `Extract a range of lines into a new function.

This tool:
1. Takes the specified lines from the file
2. Analyzes variable usage to determine function parameters
3. Creates a new function with the extracted code
4. Replaces the original code with a function call

The new function is inserted just before the containing function/method.

Use cases:
- Reduce function complexity by extracting logic
- Create reusable helper functions
- Improve code organization

IMPORTANT: Use dry_run=true first to preview the extraction.

Limitations:
- Works best with self-contained code blocks
- May not handle complex control flow (early returns, breaks)
- Parameters are detected heuristically`,
      inputSchema: {
        file_path: z.string().describe("Path to the file"),
        start_line: z.number().describe("First line to extract (1-indexed, inclusive)"),
        end_line: z.number().describe("Last line to extract (1-indexed, inclusive)"),
        function_name: z.string().describe("Name for the new function"),
        dry_run: z
          .boolean()
          .optional()
          .describe("If true, show what would change without making changes (default: false)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        functionName: z.string().optional(),
        extractedCode: z.string().optional(),
        generatedFunction: z.string().optional(),
        callSite: z.string().optional(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (input: ExtractFunctionInput): Promise<ToolResponse<ExtractFunctionOutput>> => {
      const { file_path, start_line, end_line, function_name, dry_run = false } = input;

      // Validate input
      if (start_line < 1) {
        return {
          content: [{ type: "text", text: "Error: start_line must be >= 1" }],
          structuredContent: { success: false, error: "start_line must be >= 1" },
        };
      }

      if (end_line < start_line) {
        return {
          content: [{ type: "text", text: "Error: end_line must be >= start_line" }],
          structuredContent: { success: false, error: "end_line must be >= start_line" },
        };
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(function_name)) {
        return {
          content: [{ type: "text", text: "Error: Invalid function name" }],
          structuredContent: { success: false, error: "Invalid function name" },
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

      if (end_line > lines.length) {
        return {
          content: [{ type: "text", text: `Error: end_line ${end_line} exceeds file length ${lines.length}` }],
          structuredContent: { success: false, error: `end_line ${end_line} exceeds file length ${lines.length}` },
        };
      }

      // Extract the code block
      const extractedLines = lines.slice(start_line - 1, end_line);
      const extractedCode = extractedLines.join('\n');

      // Detect the base indentation of the extracted code
      const baseIndent = getBaseIndent(extractedLines);

      // Analyze variable usage
      const analysis = analyzeVariables(extractedCode, lines, start_line, end_line);

      // Detect if the code is async (contains await)
      const isAsync = /\bawait\b/.test(extractedCode);

      // Detect the language/style (TypeScript or JavaScript)
      const isTypeScript = file_path.endsWith('.ts') || file_path.endsWith('.tsx');

      // Generate the function signature
      const params = analysis.parameters.join(', ');
      const asyncKeyword = isAsync ? 'async ' : '';
      const returnType = isTypeScript && analysis.returnVariables.length > 0
        ? `: ${analysis.returnVariables.length === 1 ? 'typeof ' + analysis.returnVariables[0] : '{ ' + analysis.returnVariables.map(v => `${v}: typeof ${v}`).join(', ') + ' }'}`
        : '';

      // De-indent the extracted code to function level
      const deindentedCode = deindent(extractedLines, baseIndent);
      const functionBody = indentCode(deindentedCode, '  ');

      // Build the return statement
      let returnStatement = '';
      if (analysis.returnVariables.length === 1) {
        returnStatement = `\n  return ${analysis.returnVariables[0]};`;
      } else if (analysis.returnVariables.length > 1) {
        returnStatement = `\n  return { ${analysis.returnVariables.join(', ')} };`;
      }

      // Generate the new function
      const generatedFunction = `${asyncKeyword}function ${function_name}(${params})${returnType} {\n${functionBody}${returnStatement}\n}`;

      // Generate the call site
      const awaitKeyword = isAsync ? 'await ' : '';
      let callSite: string;
      if (analysis.returnVariables.length === 0) {
        callSite = `${baseIndent}${awaitKeyword}${function_name}(${analysis.parameters.join(', ')});`;
      } else if (analysis.returnVariables.length === 1) {
        callSite = `${baseIndent}const ${analysis.returnVariables[0]} = ${awaitKeyword}${function_name}(${analysis.parameters.join(', ')});`;
      } else {
        callSite = `${baseIndent}const { ${analysis.returnVariables.join(', ')} } = ${awaitKeyword}${function_name}(${analysis.parameters.join(', ')});`;
      }

      if (dry_run) {
        const output = [
          `Dry run: Extract lines ${start_line}-${end_line} into function "${function_name}"`,
          '',
          'Extracted code:',
          '```',
          extractedCode,
          '```',
          '',
          `Detected parameters: ${analysis.parameters.length > 0 ? analysis.parameters.join(', ') : '(none)'}`,
          `Detected return values: ${analysis.returnVariables.length > 0 ? analysis.returnVariables.join(', ') : '(none)'}`,
          '',
          'Generated function:',
          '```',
          generatedFunction,
          '```',
          '',
          'Replacement call site:',
          '```',
          callSite,
          '```',
        ];

        return {
          content: [{ type: "text", text: output.join('\n') }],
          structuredContent: {
            success: true,
            functionName: function_name,
            extractedCode,
            generatedFunction,
            callSite,
            startLine: start_line,
            endLine: end_line,
            dryRun: true,
          },
        };
      }

      // Find where to insert the new function
      // Strategy: Find the containing function and insert just before it
      const insertLine = findInsertionPoint(lines, start_line);

      // Build the new file content
      const newLines: string[] = [];

      // Add lines before insertion point
      for (let i = 0; i < insertLine - 1; i++) {
        newLines.push(lines[i]);
      }

      // Add the new function
      newLines.push('');
      newLines.push(generatedFunction);
      newLines.push('');

      // Add lines from insertion point to start of extracted code
      for (let i = insertLine - 1; i < start_line - 1; i++) {
        newLines.push(lines[i]);
      }

      // Add the call site (replacing extracted lines)
      newLines.push(callSite);

      // Add lines after extracted code
      for (let i = end_line; i < lines.length; i++) {
        newLines.push(lines[i]);
      }

      const newContent = newLines.join('\n');

      // Write the file
      const writeResult = syntax.writeFile(file_path, newContent);
      if (!writeResult.ok) {
        return {
          content: [{ type: "text", text: `Error writing file: ${writeResult.error.message}` }],
          structuredContent: { success: false, error: writeResult.error.message },
        };
      }

      const output = [
        `Extracted lines ${start_line}-${end_line} into function "${function_name}"`,
        '',
        `Parameters: ${analysis.parameters.length > 0 ? analysis.parameters.join(', ') : '(none)'}`,
        `Return values: ${analysis.returnVariables.length > 0 ? analysis.returnVariables.join(', ') : '(none)'}`,
        '',
        'Generated function inserted before the containing function.',
        'Original code replaced with function call.',
      ];

      return {
        content: [{ type: "text", text: output.join('\n') }],
        structuredContent: {
          success: true,
          functionName: function_name,
          extractedCode,
          generatedFunction,
          callSite,
          startLine: start_line,
          endLine: end_line,
          dryRun: false,
        },
      };
    }
  );
}

/**
 * Analyze variables used in the extracted code.
 * Detect which are parameters (used but not declared) and which are return values (modified and used after).
 */
function analyzeVariables(
  extractedCode: string,
  allLines: string[],
  startLine: number,
  endLine: number
): { parameters: string[]; returnVariables: string[] } {
  // Simple heuristic-based variable analysis
  // This won't be perfect but should work for common cases

  // Find all identifiers used in the extracted code
  const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const usedIdentifiers = new Set<string>();
  let match;
  while ((match = identifierPattern.exec(extractedCode)) !== null) {
    usedIdentifiers.add(match[1]);
  }

  // Filter out keywords and common globals
  const keywords = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'function', 'const', 'let', 'var', 'class', 'new', 'this',
    'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in',
    'try', 'catch', 'finally', 'throw', 'async', 'await', 'import', 'export',
    'default', 'from', 'as', 'of', 'void', 'delete', 'extends', 'implements',
    'interface', 'type', 'enum', 'public', 'private', 'protected', 'static',
    'readonly', 'abstract', 'super', 'yield', 'get', 'set',
    // Common globals
    'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set', 'Symbol', 'BigInt',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
    'decodeURIComponent', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'fetch', 'window', 'document', 'process', 'require', 'module', 'exports',
  ]);

  // Find variables declared in the extracted code
  const declaredInExtract = new Set<string>();
  const declPatterns = [
    /\b(?:const|let|var)\s+(\w+)/g,
    /\bfunction\s+(\w+)/g,
    /\bclass\s+(\w+)/g,
  ];
  for (const pattern of declPatterns) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(extractedCode)) !== null) {
      declaredInExtract.add(match[1]);
    }
  }

  // Find variables declared before the extracted code
  const codeBefore = allLines.slice(0, startLine - 1).join('\n');
  const declaredBefore = new Set<string>();
  for (const pattern of declPatterns) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(codeBefore)) !== null) {
      declaredBefore.add(match[1]);
    }
  }

  // Parameters: used in extract, not declared in extract, declared before
  const parameters: string[] = [];
  for (const id of usedIdentifiers) {
    if (!keywords.has(id) && !declaredInExtract.has(id) && declaredBefore.has(id)) {
      parameters.push(id);
    }
  }

  // Find variables that might be modified and used after
  // Look for assignments in extracted code
  const assignmentPattern = /\b(\w+)\s*(?:=(?!=)|[+\-*/%]?=)/g;
  const modifiedVars = new Set<string>();
  assignmentPattern.lastIndex = 0;
  while ((match = assignmentPattern.exec(extractedCode)) !== null) {
    modifiedVars.add(match[1]);
  }

  // Check if modified variables are used after the extracted code
  const codeAfter = allLines.slice(endLine).join('\n');
  const usedAfter = new Set<string>();
  identifierPattern.lastIndex = 0;
  while ((match = identifierPattern.exec(codeAfter)) !== null) {
    usedAfter.add(match[1]);
  }

  // Return variables: declared in extract and used after
  const returnVariables: string[] = [];
  for (const v of declaredInExtract) {
    if (usedAfter.has(v)) {
      returnVariables.push(v);
    }
  }

  // Also check modified vars that were declared before and used after
  for (const v of modifiedVars) {
    if (declaredBefore.has(v) && usedAfter.has(v) && !returnVariables.includes(v)) {
      returnVariables.push(v);
    }
  }

  return { parameters: parameters.sort(), returnVariables: returnVariables.sort() };
}

/**
 * Get the base indentation of a block of lines.
 */
function getBaseIndent(lines: string[]): string {
  let minIndent = Infinity;
  let indentStr = '';

  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = line.match(/^(\s*)/);
    if (match && match[1].length < minIndent) {
      minIndent = match[1].length;
      indentStr = match[1];
    }
  }

  return indentStr || '';
}

/**
 * Remove base indentation from lines.
 */
function deindent(lines: string[], baseIndent: string): string[] {
  return lines.map(line => {
    if (line.startsWith(baseIndent)) {
      return line.slice(baseIndent.length);
    }
    return line;
  });
}

/**
 * Add indentation to code.
 */
function indentCode(lines: string[], indent: string): string {
  return lines.map(line => line.trim() === '' ? '' : indent + line).join('\n');
}

/**
 * Find the line where we should insert the new function.
 * Strategy: Find the start of the containing function/method and insert before it.
 */
function findInsertionPoint(lines: string[], extractLine: number): number {
  // Walk backwards from extractLine to find function/method start
  const patterns = [
    /^\s*(export\s+)?(async\s+)?function\s+\w+/,
    /^\s*(export\s+)?(async\s+)?(\w+)\s*[=:]\s*(async\s+)?\(/,
    /^\s*(public|private|protected)?\s*(static)?\s*(async\s+)?(\w+)\s*\(/,
    /^\s*(export\s+)?class\s+\w+/,
  ];

  for (let i = extractLine - 1; i >= 0; i--) {
    const line = lines[i];
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        return i + 1; // Return 1-indexed line number
      }
    }
  }

  // Default: insert at line 1
  return 1;
}

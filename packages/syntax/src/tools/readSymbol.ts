import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { SymbolContentSchema } from "./schemas.js";
import type { SymbolContent } from "../core/model.js";

interface ReadSymbolInput {
  file_path: string;
  name_path: string;
  context?: number;
}

interface ReadSymbolOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  symbol?: SymbolContent;
}

export const registerReadSymbol: ToolRegistrar = (server, service) => {
  server.registerTool(
    "read_symbol",
    {
      title: "Read symbol",
      description: `Read a specific symbol's code by its name path.

INSTEAD OF: Read tool for functions/classes (which requires knowing line numbers).

Name paths are hierarchical: "MyClass/myMethod" reads myMethod inside MyClass.
For top-level symbols, just use the name: "myFunction".

Use cases:
- Read just one function without loading the whole file
- Get a class method's implementation
- Targeted code reading to save context`,
      inputSchema: {
        file_path: z.string().describe("Path to the source file"),
        name_path: z.string().describe("Symbol name path (e.g., 'MyClass/myMethod' or 'myFunction')"),
        context: z.number().optional().describe("Lines of context to include before/after (default: 0)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        symbol: SymbolContentSchema.optional(),
      },
    },
    async (input: ReadSymbolInput): Promise<ToolResponse<ReadSymbolOutput>> => {
      const result = await service.readSymbol({
        filePath: input.file_path,
        namePath: input.name_path,
        context: input.context,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const symbol = result.value;
      const header = `// ${symbol.namePath} (${symbol.kind}) - Lines ${symbol.startLine}-${symbol.endLine}`;

      return {
        content: [{ type: "text", text: `${header}\n${symbol.body}` }],
        structuredContent: { success: true, symbol },
      };
    }
  );
};

import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";

interface WaitForPatternInput {
  id: string;
  pattern: string;
  timeout_ms?: number;
}

interface WaitForPatternOutput extends Record<string, unknown> {
  matched: boolean;
  match?: string;
  error?: string;
}

export const registerWaitForPattern: ToolRegistrar = (server, service) => {
  server.registerTool(
    "wait_for_pattern",
    {
      title: "Wait for output pattern",
      description: `Block until a pattern appears in process output. Essential for knowing when servers are ready.

Examples:
- Wait for server: pattern="listening on port \\d+"
- Wait for build: pattern="compiled successfully"
- Wait for ready: pattern="ready|started|listening"

Returns immediately if pattern already exists in logs. Times out after timeout_ms (default: 30s).`,
      inputSchema: {
        id: z.string().describe("Process session ID"),
        pattern: z.string().describe("Regex pattern to wait for"),
        timeout_ms: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
      },
      outputSchema: {
        matched: z.boolean(),
        match: z.string().optional(),
        error: z.string().optional(),
      },
    },
    async (input: WaitForPatternInput): Promise<ToolResponse<WaitForPatternOutput>> => {
      try {
        const match = await service.waitForPattern(input.id, input.pattern, {
          timeoutMs: input.timeout_ms ?? 30000,
        });

        return {
          content: [{ type: "text", text: `Matched: ${match}` }],
          structuredContent: { matched: true, match },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          structuredContent: { matched: false, error },
        };
      }
    }
  );
};

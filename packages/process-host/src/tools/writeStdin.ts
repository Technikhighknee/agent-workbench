import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";

interface WriteStdinInput {
  id: string;
  data: string;
}

interface WriteStdinOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  written?: boolean;
}

export const registerWriteStdin: ToolRegistrar = (server, service) => {
  server.registerTool(
    "write_stdin",
    {
      title: "Write to process stdin",
      description: `Send input to a running process's stdin.

Use cases:
- Interactive prompts: answer yes/no questions
- REPL inputs: send commands to node, python, etc.
- Any process expecting input

Add \\n for newline if the process expects Enter.`,
      inputSchema: {
        id: z.string().describe("Process session ID"),
        data: z.string().describe("Data to write (include \\n for newline)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        written: z.boolean().optional(),
      },
    },
    async (input: WriteStdinInput): Promise<ToolResponse<WriteStdinOutput>> => {
      const result = service.write(input.id, input.data);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const lines = [result.value ? "Written" : "Write failed (stdin closed?)"];
      const runningHint = formatRunningProcessesHint(service.listRunning(), input.id);
      if (runningHint) lines.push(runningHint);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, written: result.value },
      };
    }
  );
};

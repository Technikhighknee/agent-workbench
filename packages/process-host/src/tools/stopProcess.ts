import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, StopResult, SignalValue } from "./types.js";
import { SignalSchema, StopResultSchema } from "./schemas.js";

interface StopProcessInput {
  id: string;
  signal?: SignalValue;
}

interface StopProcessOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  process?: StopResult;
}

export const registerStopProcess: ToolRegistrar = (server, service) => {
  server.registerTool(
    "stop_process",
    {
      title: "Stop process",
      description: `Terminate a running process.

Signals:
- SIGTERM (default): Graceful shutdown, allows cleanup
- SIGINT: Same as Ctrl+C
- SIGKILL: Force kill immediately
- SIGHUP: Hangup signal`,
      inputSchema: {
        id: z.string().describe("Process session ID"),
        signal: SignalSchema.optional().describe("Signal to send (default: SIGTERM)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        process: StopResultSchema.optional(),
      },
    },
    async (input: StopProcessInput): Promise<ToolResponse<StopProcessOutput>> => {
      const result = await service.stop({ id: input.id, signal: input.signal });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const p = result.value;
      const stopResult: StopResult = {
        id: p.id,
        status: p.status,
        endedAt: p.endedAt ?? null,
      };

      return {
        content: [{ type: "text", text: `Stopped: ${p.id}` }],
        structuredContent: { success: true, process: stopResult },
      };
    }
  );
};

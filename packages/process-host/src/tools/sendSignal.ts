import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";
import { SignalSchema } from "./schemas.js";

interface SendSignalInput {
  id: string;
  signal: "SIGTERM" | "SIGKILL" | "SIGINT" | "SIGHUP";
}

interface SendSignalOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  signalSent?: string;
}

export const registerSendSignal: ToolRegistrar = (server, service) => {
  server.registerTool(
    "send_signal",
    {
      title: "Send signal to process",
      description: `Send a specific signal to a running process without stopping tracking.

Signals:
- SIGTERM: Request graceful termination
- SIGINT: Interrupt (Ctrl+C)
- SIGKILL: Force kill (cannot be caught)
- SIGHUP: Hangup (often triggers reload)

Use cases:
- Send SIGHUP to reload config
- Send SIGINT for graceful interrupt
- Debug signal handling`,
      inputSchema: {
        id: z.string().describe("Process session ID"),
        signal: SignalSchema.describe("Signal to send"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        signalSent: z.string().optional(),
      },
    },
    async (input: SendSignalInput): Promise<ToolResponse<SendSignalOutput>> => {
      const result = await service.sendSignal(input.id, input.signal);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const lines = [`Sent ${input.signal} to ${input.id}`];
      const runningHint = formatRunningProcessesHint(service.listRunning(), input.id);
      if (runningHint) lines.push(runningHint);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, signalSent: input.signal },
      };
    }
  );
};

import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { SignalSchema } from "./schemas.js";

interface StopAllInput {
  signal?: "SIGTERM" | "SIGKILL" | "SIGINT" | "SIGHUP";
}

interface StopAllOutput extends Record<string, unknown> {
  stopped: string[];
  failed: string[];
  count: number;
}

export const registerStopAllProcesses: ToolRegistrar = (server, service) => {
  server.registerTool(
    "stop_all_processes",
    {
      title: "Stop all processes",
      description: `Stop all running processes at once.

Use cases:
- Clean shutdown before system restart
- Emergency stop of all background tasks
- Reset development environment

Returns list of stopped and failed process IDs.`,
      inputSchema: {
        signal: SignalSchema.optional().describe("Signal to send (default: SIGTERM)"),
      },
      outputSchema: {
        stopped: z.array(z.string()),
        failed: z.array(z.string()),
        count: z.number(),
      },
    },
    async (input: StopAllInput): Promise<ToolResponse<StopAllOutput>> => {
      const result = await service.stopAll(input.signal ?? "SIGTERM");

      const message = result.stopped.length === 0
        ? "No running processes to stop"
        : `Stopped ${result.stopped.length} process${result.stopped.length === 1 ? "" : "es"}${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}`;

      return {
        content: [{ type: "text", text: message }],
        structuredContent: { ...result, count: result.stopped.length },
      };
    }
  );
};

import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, ProcessSummary } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";
import { ProcessSummarySchema } from "./schemas.js";

interface RestartProcessInput {
  id: string;
}

interface RestartProcessOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  originalId?: string;
  process?: ProcessSummary;
}

export const registerRestartProcess: ToolRegistrar = (server, service) => {
  server.registerTool(
    "restart_process",
    {
      title: "Restart process",
      description: `Restart a process with the same configuration.

Stops the process if running, then starts a new one with identical settings.
Returns the new process ID - the original process remains in history.

Use cases:
- Restart crashed dev servers
- Apply config changes by restarting
- Quick recovery from failures`,
      inputSchema: {
        id: z.string().describe("Process session ID to restart"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        originalId: z.string().optional(),
        process: ProcessSummarySchema.optional(),
      },
    },
    async (input: RestartProcessInput): Promise<ToolResponse<RestartProcessOutput>> => {
      const result = service.restart(input.id);

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const p = result.value;
      const processSummary: ProcessSummary = {
        id: p.id,
        command: p.command,
        args: p.args,
        label: p.label,
        status: p.status,
        pid: p.pid,
        startedAt: p.startedAt,
      };

      const lines = [`Restarted: ${p.label ?? p.command} (${input.id} → ${p.id})`];
      const runningHint = formatRunningProcessesHint(service.listRunning(), p.id);
      if (runningHint) lines.push(runningHint);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, originalId: input.id, process: processSummary },
      };
    }
  );
};

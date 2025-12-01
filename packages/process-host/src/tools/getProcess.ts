import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, ProcessDetails } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";
import { ProcessDetailsSchema } from "./schemas.js";

interface GetProcessInput {
  id: string;
}

interface GetProcessOutput extends Record<string, unknown> {
  found: boolean;
  process?: ProcessDetails;
}

export const registerGetProcess: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_process",
    {
      title: "Get process details",
      description: "Get full details about a specific process without logs.",
      inputSchema: {
        id: z.string().describe("Process session ID"),
      },
      outputSchema: {
        found: z.boolean(),
        process: ProcessDetailsSchema.optional(),
      },
    },
    async (input: GetProcessInput): Promise<ToolResponse<GetProcessOutput>> => {
      const p = service.getProcess(input.id);

      if (!p) {
        return {
          content: [{ type: "text", text: `Process not found: ${input.id}` }],
          structuredContent: { found: false },
        };
      }

      const processDetails: ProcessDetails = {
        id: p.id,
        command: p.command,
        args: p.args,
        cwd: p.cwd,
        env: p.env,
        label: p.label,
        status: p.status,
        pid: p.pid,
        exitCode: p.exitCode ?? null,
        timeoutMs: p.timeoutMs,
        startedAt: p.startedAt,
        endedAt: p.endedAt ?? null,
      };

      const lines = [`[${p.status}] ${p.label ?? p.command}`];
      const runningHint = formatRunningProcessesHint(service.listRunning(), p.id);
      if (runningHint) lines.push(runningHint);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { found: true, process: processDetails },
      };
    }
  );
};

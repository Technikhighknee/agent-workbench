import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, ProcessSummary } from "./types.js";
import { ProcessStatusSchema, ProcessSummarySchema } from "./schemas.js";

interface StartProcessInput {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
  timeout_ms?: number;
}

interface StartProcessOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  process?: ProcessSummary;
}

export const registerStartProcess: ToolRegistrar = (server, service) => {
  server.registerTool(
    "start_process",
    {
      title: "Start process",
      description: `Start a long-running command. Returns immediately with process ID for later reference.

Use cases:
- Dev servers: "npm run dev", "python -m http.server"
- Build watchers: "npm run watch", "tsc --watch"
- Any background process you need to monitor

The process persists across tool calls. Use get_logs to check output, stop_process to terminate.`,
      inputSchema: {
        command: z.string().describe("Shell command to run (supports quotes: npm run 'my script')"),
        cwd: z.string().optional().describe("Working directory (absolute or relative to server)"),
        env: z.record(z.string(), z.string()).optional().describe("Environment variables to set/override"),
        label: z.string().optional().describe("Human-readable label for easy identification"),
        timeout_ms: z.number().optional().describe("Auto-kill after N milliseconds (min 1000)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        process: ProcessSummarySchema.optional(),
      },
    },
    async (input: StartProcessInput): Promise<ToolResponse<StartProcessOutput>> => {
      const result = service.start({
        command: input.command,
        cwd: input.cwd,
        env: input.env,
        label: input.label,
        timeoutMs: input.timeout_ms,
      });

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

      return {
        content: [{ type: "text", text: `Started: ${p.label ?? p.command} (${p.id})` }],
        structuredContent: { success: true, process: processSummary },
      };
    }
  );
};

import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, ProcessDetails } from "./types.js";
import { ProcessDetailsSchema } from "./schemas.js";

/** Strip ANSI codes and trim output */
function compactOutput(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "") // Strip ANSI
    .replace(/\r(?!\n)/g, "\n") // CR to newline
    .trim();
}

interface RunProcessInput {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
  timeout_ms?: number;
}

interface RunProcessOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  process?: ProcessDetails;
  logs?: string;
  exitCode?: number | null;
}

export const registerRunProcess: ToolRegistrar = (server, service) => {
  server.registerTool(
    "run_process",
    {
      title: "Run process",
      description: `Run a command and wait for completion. Output is cleaned and compacted.

Use cases:
- Build commands: "npm run build", "cargo build"
- Tests: "npm test", "pytest"
- Any command that finishes on its own

Benefits over Bash:
- No timeout (waits indefinitely)
- Strips ANSI codes and progress bars
- Compacts output (keeps errors, omits middle)
- Persists in history for debugging`,
      inputSchema: {
        command: z.string().describe("Shell command to run"),
        cwd: z.string().optional().describe("Working directory"),
        env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
        label: z.string().optional().describe("Human-readable label"),
        timeout_ms: z.number().optional().describe("Max wait time in milliseconds (default: 10 minutes)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        process: ProcessDetailsSchema.optional(),
        logs: z.string().optional(),
        exitCode: z.number().nullable().optional(),
      },
    },
    async (input: RunProcessInput): Promise<ToolResponse<RunProcessOutput>> => {
      const result = await service.run({
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

      const { process: p, logs, exitCode } = result.value;
      const processDetails: ProcessDetails = {
        id: p.id,
        command: p.command,
        args: p.args,
        label: p.label,
        status: p.status,
        pid: p.pid,
        startedAt: p.startedAt,
        cwd: p.cwd,
        env: p.env,
        exitCode: p.exitCode ?? null,
        timeoutMs: p.timeoutMs,
        endedAt: p.endedAt ?? null,
      };

      // Calculate duration
      const durationMs = p.endedAt && p.startedAt
        ? new Date(p.endedAt).getTime() - new Date(p.startedAt).getTime()
        : null;
      const durationStr = durationMs !== null
        ? durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
        : "";

      const statusText = exitCode === 0 ? "✓" : exitCode === null ? "timeout" : `✗ exit ${exitCode}`;
      const cleanLogs = compactOutput(logs);

      // Concise output: status + duration + logs
      const header = durationStr
        ? `[${statusText}] ${p.label ?? p.command} (${durationStr})`
        : `[${statusText}] ${p.label ?? p.command}`;
      const output = cleanLogs.trim() ? `${header}\n${cleanLogs}` : header;

      return {
        content: [{ type: "text", text: output }],
        structuredContent: {
          success: exitCode === 0,
          process: processDetails,
          logs: cleanLogs,
          exitCode,
        },
      };
    }
  );
};

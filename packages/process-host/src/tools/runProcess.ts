import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, ProcessDetails } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";
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
  id?: string;
  process?: ProcessDetails;
  logs?: string;
  exitCode?: number | null;
  stillRunning?: boolean;
}

export const registerRunProcess: ToolRegistrar = (server, service) => {
  server.registerTool(
    "run_process",
    {
      title: "Run process",
      description: `Run a command and wait for completion. Output is cleaned and compacted.

INSTEAD OF: Bash tool for builds/tests (which has 2-minute timeout and raw output).

Use cases:
- Build commands: "npm run build", "cargo build"
- Tests: "npm test", "pytest"
- Any command that finishes on its own

Benefits over Bash:
- Default 30s wait, then returns control (process continues in background)
- Strips ANSI codes and progress bars
- Compacts output (keeps errors, omits middle)
- Persists in history for debugging`,
      inputSchema: {
        command: z.string().describe("Shell command to run"),
        cwd: z.string().optional().describe("Working directory"),
        env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
        label: z.string().optional().describe("Human-readable label"),
        timeout_ms: z.number().optional().describe("Max wait time in milliseconds (default: 30 seconds)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        id: z.string().optional().describe("Process ID - use with stop_process/get_logs if stillRunning"),
        process: ProcessDetailsSchema.optional(),
        logs: z.string().optional(),
        exitCode: z.number().nullable().optional(),
        stillRunning: z.boolean().optional().describe("True if process is still running after timeout"),
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

      const { process: p, logs, exitCode, stillRunning } = result.value;
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

      const cleanLogs = compactOutput(logs);
      const lines: string[] = [];

      if (stillRunning) {
        // Process still running - give agent escape options
        lines.push(`⏳ Process still running after ${(input.timeout_ms ?? 30000) / 1000}s`);
        lines.push(`ID: ${p.id}`);
        if (cleanLogs.trim()) {
          lines.push(`\nOutput so far:\n${cleanLogs}`);
        }
        lines.push(`\n---`);
        lines.push(`**Process still running.** You have control:`);
        lines.push(`- \`get_logs({ id: "${p.id}" })\` - check progress`);
        lines.push(`- \`stop_process({ id: "${p.id}" })\` - cancel (like Ctrl+C)`);
        lines.push(`- \`wait_for_pattern({ id: "${p.id}", pattern: "..." })\` - wait for specific output`);
      } else {
        // Process completed
        const durationMs = p.endedAt && p.startedAt
          ? new Date(p.endedAt).getTime() - new Date(p.startedAt).getTime()
          : null;
        const durationStr = durationMs !== null
          ? durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
          : "";

        const statusText = exitCode === 0 ? "✓" : `✗ exit ${exitCode}`;
        const header = durationStr
          ? `[${statusText}] ${p.label ?? p.command} (${durationStr})`
          : `[${statusText}] ${p.label ?? p.command}`;
        
        lines.push(header);
        if (cleanLogs.trim()) {
          lines.push(cleanLogs);
        }
      }

      // Check for orphan processes and warn
      const runningHint = formatRunningProcessesHint(service.listRunning(), p.id);
      if (runningHint) {
        lines.push(runningHint);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          success: exitCode === 0 && !stillRunning,
          id: p.id,
          process: processDetails,
          logs: cleanLogs,
          exitCode,
          stillRunning,
        },
      };
    }
  );
};

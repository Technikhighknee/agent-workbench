/**
 * task_run - Run a command and wait for completion.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";
import { formatTask, formatOutput } from "./format.js";

const InputSchema = {
  command: z.string().min(1).describe("Shell command to execute"),
  label: z.string().optional().describe("Human-readable label for the task"),
  cwd: z.string().optional().describe("Working directory"),
  timeout: z
    .number()
    .int()
    .positive()
    .max(600_000)
    .optional()
    .describe("How long to wait in milliseconds (default: 30000, max: 600000)"),
};

export function registerRun(server: McpServer, runner: TaskRunner): void {
  server.registerTool(
    "task_run",
    {
      title: "Run task",
      description: `Run a command and wait for it to complete (or timeout).

Returns the task with its output. If the command takes longer than the timeout,
returns with timedOut=true and the task continues running in the background.

Use cases:
- Build commands: "npm run build", "cargo build"
- Tests: "npm test", "pytest"
- Any command that should complete

Default timeout: 30 seconds. Max: 10 minutes.`,
      inputSchema: InputSchema,
    },
    async (input) => {
      const { command, label, cwd, timeout } = input as {
        command: string;
        label?: string;
        cwd?: string;
        timeout?: number;
      };

      try {
        const result = await runner.run(command, { label, cwd, timeout });
        const { task, timedOut } = result;

        let text = formatTask(task);

        if (timedOut) {
          text += `\n\n**Note:** Command is still running (timed out after ${timeout ?? 30000}ms).`;
          text += `\nUse \`task_get\` to check status, \`task_kill\` to stop.`;
        }

        text += "\n\n" + formatOutput(task);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

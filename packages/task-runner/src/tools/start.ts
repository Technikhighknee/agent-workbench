/**
 * task_start - Start a background task.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";
import { formatTask, formatOutput } from "./format.js";

const InputSchema = {
  command: z.string().min(1).describe("Shell command to execute"),
  label: z.string().optional().describe("Human-readable label for the task"),
  cwd: z.string().optional().describe("Working directory"),
  wait_for: z.string().optional().describe("Regex pattern to wait for in output before returning"),
  wait_timeout: z
    .number()
    .int()
    .positive()
    .max(300_000)
    .optional()
    .describe("How long to wait for pattern in milliseconds (default: 30000)"),
};

export function registerStart(server: McpServer, runner: TaskRunner): void {
  server.registerTool(
    "task_start",
    {
      title: "Start background task",
      description: `Start a command in the background and return immediately.

The task continues running after this call returns. Use \`task_get\` to check
status and output, \`task_kill\` to stop it.

Optionally wait for a pattern in output before returning (useful for servers).

Use cases:
- Dev servers: "npm run dev", "python -m http.server"
- Watch processes: "npm run watch", "tsc --watch"
- Long-running services

Example with wait_for:
  command: "npm run dev"
  wait_for: "ready|listening"
  wait_timeout: 30000`,
      inputSchema: InputSchema,
    },
    async (input) => {
      const { command, label, cwd, wait_for, wait_timeout } = input as {
        command: string;
        label?: string;
        cwd?: string;
        wait_for?: string;
        wait_timeout?: number;
      };

      try {
        // Changed from spawn() to start()
        const task = runner.start(command, { label, cwd });

        let text = formatTask(task);
        text += `\n\nTask started in background.`;

        // If wait_for is specified, wait for the pattern
        if (wait_for) {
          const pattern = new RegExp(wait_for);
          const timeout = wait_timeout ?? 30_000;

          text += `\nWaiting for pattern: ${wait_for}`;

          const result = await runner.waitFor(task.id, { pattern, timeout });

          if (result.matched) {
            text += `\n**Pattern matched!**`;
          } else if (result.task.status !== "running") {
            text += `\n**Task exited before pattern matched** (status: ${result.task.status})`;
          } else {
            text += `\n**Timeout waiting for pattern** (task still running)`;
          }

          // Show updated task info
          text = formatTask(result.task) + "\n" + text.split("\n").slice(1).join("\n");
          text += "\n\n" + formatOutput(result.output);
        }

        text += `\n\nUse \`task_get ${task.id}\` to check status.`;
        text += `\nUse \`task_kill ${task.id}\` to stop.`;

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

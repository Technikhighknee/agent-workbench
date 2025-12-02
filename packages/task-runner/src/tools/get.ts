/**
 * task_get - Get task status and output.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";
import { formatTask, formatOutput } from "./format.js";

const InputSchema = {
  id: z.string().min(1).describe("Task ID"),
  wait_for: z.string().optional().describe("Regex pattern to wait for in output"),
  wait_timeout: z
    .number()
    .int()
    .positive()
    .max(300_000)
    .optional()
    .describe("How long to wait for pattern in milliseconds (default: 30000)"),
};

export function registerGet(server: McpServer, runner: TaskRunner): void {
  server.registerTool(
    "task_get",
    {
      title: "Get task",
      description: `Get a task's current status and output.

Returns task metadata and combined stdout/stderr output.
Optionally wait for a pattern in output before returning.

Use cases:
- Check if a background task is still running
- Get output from a completed task
- Wait for a server to be ready`,
      inputSchema: InputSchema,
    },
    async (input) => {
      const { id, wait_for, wait_timeout } = input as {
        id: string;
        wait_for?: string;
        wait_timeout?: number;
      };

      try {
        // If wait_for specified, use waitFor
        if (wait_for) {
          const pattern = new RegExp(wait_for);
          const timeout = wait_timeout ?? 30_000;

          const result = await runner.waitFor(id, { pattern, timeout });

          let text = formatTask(result.task);

          if (result.matched) {
            text += `\n\n**Pattern matched:** ${wait_for}`;
          } else if (result.task.status !== "running") {
            text += `\n\n**Pattern not found** (task exited with status: ${result.task.status})`;
          } else {
            text += `\n\n**Timeout waiting for pattern** (task still running)`;
          }

          text += "\n\n" + formatOutput(result.task);

          return {
            content: [{ type: "text" as const, text }],
          };
        }

        // Simple get
        const task = runner.get(id);

        if (!task) {
          return {
            content: [{ type: "text" as const, text: `Task not found: ${id}` }],
            isError: true,
          };
        }

        const text = formatTask(task) + "\n\n" + formatOutput(task);

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

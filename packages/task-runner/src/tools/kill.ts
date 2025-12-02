/**
 * task_kill - Stop a running task.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";
import { formatTask } from "./format.js";

const InputSchema = {
  id: z.string().min(1).describe("Task ID"),
  force: z.boolean().optional().describe("Use SIGKILL instead of SIGTERM (default: false)"),
};

export function registerKill(server: McpServer, runner: TaskRunner): void {
  server.registerTool(
    "task_kill",
    {
      title: "Kill task",
      description: `Stop a running task.

By default sends SIGTERM for graceful shutdown.
Use force=true to send SIGKILL for immediate termination.

Use cases:
- Stop a dev server
- Cancel a long-running build
- Clean up background processes`,
      inputSchema: InputSchema,
    },
    async (input) => {
      const { id, force } = input as { id: string; force?: boolean };

      try {
        const signal = force ? "SIGKILL" : "SIGTERM";
        const killed = runner.kill(id, signal);

        if (!killed) {
          // Try to get task to check if it exists
          const task = runner.get(id);
          if (!task) {
            return {
              content: [{ type: "text" as const, text: `Task not found: ${id}` }],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: `Task is not running (status: ${task.status})\n\n${formatTask(task)}`,
              },
            ],
          };
        }

        // Get updated task
        const task = runner.get(id);
        const text = task
          ? `Task killed with ${signal}.\n\n${formatTask(task)}`
          : `Task ${id} killed with ${signal}.`;

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

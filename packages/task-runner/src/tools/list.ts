/**
 * task_list - List all tasks.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";
import type { Task } from "../model.js";
import { formatDuration } from "./format.js";

const InputSchema = {
  running: z.boolean().optional().describe("Only show running tasks (default: false)"),
};

function statusEmoji(status: string): string {
  switch (status) {
    case "running":
      return "🔄";
    case "done":
      return "✅";
    case "failed":
      return "❌";
    case "killed":
      return "🛑";
    case "orphaned":
      return "👻";
    default:
      return "❓";
  }
}

function formatTaskRow(task: Task): string {
  const emoji = statusEmoji(task.status);
  // Parse ISO strings to Date objects
  const startedAt = new Date(task.startedAt);
  const endedAt = task.endedAt ? new Date(task.endedAt) : null;
  const duration = formatDuration(startedAt, endedAt ?? new Date());
  const label = task.label ? ` "${task.label}"` : "";
  const cmd = task.command.length > 40 ? task.command.slice(0, 37) + "..." : task.command;

  return `${emoji} **${task.id}**${label} - ${cmd} (${duration})`;
}

export function registerList(server: McpServer, runner: TaskRunner): void {
  server.registerTool(
    "task_list",
    {
      title: "List tasks",
      description: `List all tasks, showing status and duration.

Use running=true to filter to only running tasks.

Status indicators:
- 🔄 running
- ✅ done (exit 0)
- ❌ failed (exit != 0)
- 🛑 killed
- 👻 orphaned (from server restart)`,
      inputSchema: InputSchema,
    },
    async (input) => {
      const { running } = input as { running?: boolean };

      try {
        const tasks = runner.list(running);

        if (tasks.length === 0) {
          const msg = running ? "No running tasks." : "No tasks.";
          return {
            content: [{ type: "text" as const, text: msg }],
          };
        }

        const lines: string[] = [];

        // Summary
        const runningCount = tasks.filter((t) => t.status === "running").length;
        const doneCount = tasks.filter((t) => t.status === "done").length;
        const failedCount = tasks.filter((t) => t.status === "failed").length;

        lines.push(`## Tasks (${tasks.length} total)`);
        lines.push("");

        if (!running) {
          lines.push(`Running: ${runningCount} | Done: ${doneCount} | Failed: ${failedCount}`);
          lines.push("");
        }

        // Group by status
        const runningTasks = tasks.filter((t) => t.status === "running");
        const otherTasks = tasks.filter((t) => t.status !== "running");

        if (runningTasks.length > 0) {
          lines.push("### Running");
          for (const task of runningTasks) {
            lines.push(formatTaskRow(task));
          }
          lines.push("");
        }

        if (otherTasks.length > 0 && !running) {
          lines.push("### Completed");
          for (const task of otherTasks.slice(0, 20)) {
            lines.push(formatTaskRow(task));
          }
          if (otherTasks.length > 20) {
            lines.push(`... and ${otherTasks.length - 20} more`);
          }
        }

        // Tips
        lines.push("");
        lines.push("---");
        lines.push("Use `task_get <id>` to see output, `task_kill <id>` to stop.");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
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

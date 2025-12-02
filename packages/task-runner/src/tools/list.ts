/**
 * task_list - List all tasks.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskRunner } from "../TaskRunner.js";
import type { Task } from "../model.js";

const InputSchema = {
  running: z.boolean().optional().describe("Only show running tasks (default: false)"),
};

function formatDuration(start: Date, end: Date | null): string {
  const endTime = end ?? new Date();
  const ms = endTime.getTime() - start.getTime();

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}

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
  const duration = formatDuration(task.startedAt, task.endedAt);
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

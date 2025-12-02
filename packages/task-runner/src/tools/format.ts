/**
 * Shared formatting utilities for tool output.
 */

import type { Task } from "../model.js";

/**
 * Format task metadata as markdown.
 */
export function formatTask(task: Task): string {
  const lines: string[] = [];

  lines.push(`## Task: ${task.id}`);
  lines.push("");

  if (task.label) {
    lines.push(`**Label:** ${task.label}`);
  }

  lines.push(`**Command:** \`${task.command}\``);
  lines.push(`**Status:** ${formatStatus(task.status)}`);

  if (task.exitCode !== null) {
    lines.push(`**Exit code:** ${task.exitCode}`);
  }

  lines.push(`**Started:** ${task.startedAt.toISOString()}`);

  if (task.endedAt) {
    lines.push(`**Ended:** ${task.endedAt.toISOString()}`);
    lines.push(`**Duration:** ${formatDuration(task.startedAt, task.endedAt)}`);
  } else {
    lines.push(`**Running for:** ${formatDuration(task.startedAt, new Date())}`);
  }

  if (task.cwd) {
    lines.push(`**Working dir:** ${task.cwd}`);
  }

  if (task.truncated) {
    lines.push(`**Note:** Output was truncated due to size limits`);
  }

  return lines.join("\n");
}

/**
 * Format task output section.
 */
export function formatOutput(task: Task): string {
  if (!task.output || task.output.trim() === "") {
    return "### Output\n\n(no output)";
  }

  const lines = task.output.split("\n");
  const maxLines = 100;

  if (lines.length <= maxLines) {
    return `### Output\n\n\`\`\`\n${task.output}\n\`\`\``;
  }

  // Show first 30 and last 60 lines
  const head = lines.slice(0, 30).join("\n");
  const tail = lines.slice(-60).join("\n");
  const omitted = lines.length - 90;

  return `### Output\n\n\`\`\`\n${head}\n\n... (${omitted} lines omitted) ...\n\n${tail}\n\`\`\``;
}

/**
 * Format status with emoji.
 */
function formatStatus(status: string): string {
  switch (status) {
    case "running":
      return "🔄 Running";
    case "done":
      return "✅ Done";
    case "failed":
      return "❌ Failed";
    case "killed":
      return "🛑 Killed";
    case "orphaned":
      return "👻 Orphaned";
    default:
      return status;
  }
}

/**
 * Format duration between two dates.
 */
function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = Math.floor((ms % 60_000) / 1000);
    return `${mins}m ${secs}s`;
  }

  const hours = Math.floor(ms / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

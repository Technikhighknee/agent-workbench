import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProcessService } from "../core/services/ProcessService.js";

export interface ToolRegistrar {
  (server: McpServer, service: ProcessService): void;
}

export type ToolResponse<T extends Record<string, unknown>> = {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: T;
};

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ServiceResponse<T> = SuccessResponse<T> | ErrorResponse;

export interface ProcessSummary {
  id: string;
  command: string;
  args: string[];
  label?: string;
  status: ProcessStatusValue;
  pid: number | null;
  startedAt: string;
}

export interface ProcessDetails extends ProcessSummary {
  cwd?: string;
  env?: Record<string, string>;
  exitCode: number | null;
  timeoutMs?: number;
  endedAt: string | null;
}

export interface ProcessListItem {
  id: string;
  command: string;
  label?: string;
  status: ProcessStatusValue;
  pid: number | null;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface LogsOutput {
  id: string;
  status: ProcessStatusValue | "unknown";
  exitCode: number | null;
  logs: string;
}

export interface StopResult {
  id: string;
  status: ProcessStatusValue;
  endedAt: string | null;
}

export type ProcessStatusValue =
  | "starting"
  | "running"
  | "exited"
  | "failed"
  | "stopped"
  | "timeout";

export type SignalValue = "SIGTERM" | "SIGKILL" | "SIGINT" | "SIGHUP";

export type StreamValue = "stdout" | "stderr";

/**
 * Format a hint about running processes to remind the agent to clean up.
 * @param running - Array of running processes
 * @param excludeId - Optional process ID to exclude from the count (e.g., the current process)
 */
export function formatRunningProcessesHint(
  running: Array<{ id: string; label?: string; command: string }>,
  excludeId?: string
): string | null {
  const filtered = excludeId
    ? running.filter((p) => p.id !== excludeId)
    : running;

  if (filtered.length === 0) return null;

  const lines: string[] = [];
  lines.push(`\n---`);
  lines.push(`⚠️ ${filtered.length} process(es) still running:`);
  for (const proc of filtered.slice(0, 3)) {
    lines.push(`  - ${proc.label ?? proc.command} (id: ${proc.id})`);
  }
  if (filtered.length > 3) {
    lines.push(`  - ... and ${filtered.length - 3} more`);
  }
  lines.push(`Use \`stop_process\` or \`stop_all_processes\` to clean up.`);
  return lines.join("\n");
}

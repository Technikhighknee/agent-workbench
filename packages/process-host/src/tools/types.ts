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

export type ProcessStatus = "starting" | "running" | "exited" | "failed" | "stopped" | "timeout";

export type Signal = "SIGTERM" | "SIGKILL" | "SIGINT" | "SIGHUP";

export type LogStream = "stdout" | "stderr";

export interface ProcessInfo {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
  status: ProcessStatus;
  pid: number | null;
  exitCode?: number | null;
  startedAt: string;
  endedAt?: string | null;
  timeoutMs?: number;
}

export interface LogEntry {
  sessionId: string;
  stream: LogStream;
  chunk: string;
  timestamp: string;
}

export interface LogChunk {
  sessionId: string;
  logs: string;
  entries?: LogEntry[];
}

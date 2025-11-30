import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

export type Status = "running" | "exited" | "failed" | "unknown";

interface ProcessSession {
  id: string;
  label?: string;
  command: string;
  cwd?: string;
  proc: ChildProcessWithoutNullStreams;
  status: Status;
  logs: string[];
  startedAt: string;
}

export interface GetLogsResponse {
  id: string;
  status: Status;
  logs: string;
}

const sessions = new Map<string, ProcessSession>();
const MAX_LINES = 500;

export function startProcess(
  command: string,
  cwd?: string,
  label?: string
): ProcessSession {
  const id = randomUUID();
  const proc = spawn(command, {
    cwd,
    shell: true,
  });

  const session: ProcessSession = {
    id,
    label,
    command,
    cwd,
    proc,
    status: "running",
    logs: [],
    startedAt: new Date().toISOString(),
  };

  proc.stdout.on("data", (chunk) => pushLog(session, chunk.toString()));
  proc.stderr.on("data", (chunk) => pushLog(session, chunk.toString()));
  proc.on("exit", () => {
    session.status = "exited";
  });
  proc.on("error", () => {
    session.status = "failed";
  });

  sessions.set(id, session);
  return session;
}

function pushLog(session: ProcessSession, line: string): void {
  session.logs.push(line);
  if (session.logs.length > MAX_LINES) {
    session.logs.splice(0, session.logs.length - MAX_LINES);
  }
}

export function getLogs(
  id: string,
  lastLines = 100
): GetLogsResponse | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  const logs = session.logs.slice(-lastLines).join("");

  return {
    id: session.id,
    status: session.status,
    logs,
  };
}

export function stopProcess(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  try {
    session.proc.kill("SIGTERM");
    session.status = "exited";
    return true;
  } catch {
    return false;
  }
}

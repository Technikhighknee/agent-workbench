import { Signal, LogStream } from "../model.js";

export interface RunningProcessHandle {
  readonly pid: number | undefined;
  kill(signal?: Signal): Promise<boolean>;
  write(data: string): boolean;
}

export interface SpawnParams {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface SpawnCallbacks {
  onOutput: (stream: LogStream, chunk: string) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

export interface ProcessSpawner {
  spawn(params: SpawnParams, callbacks: SpawnCallbacks): RunningProcessHandle;
}

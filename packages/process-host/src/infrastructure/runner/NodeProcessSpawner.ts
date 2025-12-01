import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import {
  ProcessSpawner,
  RunningProcessHandle,
  SpawnParams,
  SpawnCallbacks,
} from "../../core/ports/ProcessSpawner.js";
import { Signal } from "../../core/model.js";

class NodeProcessHandle implements RunningProcessHandle {
  constructor(private readonly proc: ChildProcessWithoutNullStreams) {}

  get pid(): number | undefined {
    return this.proc.pid;
  }

  async kill(signal: Signal = "SIGTERM"): Promise<boolean> {
    if (!this.proc.pid) return false;
    return this.proc.kill(signal);
  }

  write(data: string): boolean {
    if (!this.proc.stdin.writable) return false;
    return this.proc.stdin.write(data);
  }
}

export class NodeProcessSpawner implements ProcessSpawner {
  spawn(params: SpawnParams, callbacks: SpawnCallbacks): RunningProcessHandle {
    const proc = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: params.env ? { ...process.env, ...params.env } : undefined,
      shell: true,
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      callbacks.onOutput("stdout", chunk.toString());
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      callbacks.onOutput("stderr", chunk.toString());
    });

    proc.on("exit", (code, signal) => {
      callbacks.onExit(code, signal);
    });

    return new NodeProcessHandle(proc);
  }
}

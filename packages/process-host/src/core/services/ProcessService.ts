import crypto from "node:crypto";
import { ProcessInfo, Signal, LogStream } from "../model.js";
import { ProcessRepository } from "../ports/ProcessRepository.js";
import { ProcessSpawner, RunningProcessHandle } from "../ports/ProcessSpawner.js";
import { LogRepository } from "../ports/LogRepository.js";
import { Result, Ok, Err } from "../result.js";

export interface StartProcessParams {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
  timeoutMs?: number;
}

export interface StopProcessParams {
  id: string;
  signal?: Signal;
}

type PatternWatcher = {
  pattern: RegExp;
  resolve: (match: string) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
};

export class ProcessService {
  private readonly handles = new Map<string, RunningProcessHandle>();
  private readonly timeouts = new Map<string, NodeJS.Timeout>();
  private readonly patternWatchers = new Map<string, PatternWatcher[]>();

  constructor(
    private readonly processes: ProcessRepository,
    private readonly logs: LogRepository,
    private readonly spawner: ProcessSpawner
  ) {}

  start(params: StartProcessParams): Result<ProcessInfo, string> {
    const command = params.command.trim();
    if (!command) return Err("Empty command");

    const info: ProcessInfo = {
      id: crypto.randomUUID(),
      command,
      args: [],
      cwd: params.cwd,
      env: params.env,
      label: params.label ?? generateLabel(command),
      status: "starting",
      pid: null,
      timeoutMs: params.timeoutMs,
      startedAt: new Date().toISOString(),
    };

    this.processes.save(info);

    const handle = this.spawner.spawn(
      { command, args: [], cwd: params.cwd, env: params.env },
      {
        onOutput: (stream, chunk) => {
          this.logs.append(info.id, stream, chunk);
          this.checkPatternWatchers(info.id, chunk);
        },
        onExit: (code, _signal) => {
          this.clearTimeout(info.id);
          this.handles.delete(info.id);
          this.rejectPatternWatchers(info.id, new Error(`Process exited with code ${code}`));
          this.processes.updateExitCode(info.id, code);
          this.processes.updateStatus(
            info.id,
            code === 0 ? "exited" : "failed",
            new Date().toISOString()
          );
        },
      }
    );

    this.handles.set(info.id, handle);
    this.processes.updatePid(info.id, handle.pid ?? null);
    this.processes.updateStatus(info.id, "running");

    if (params.timeoutMs && params.timeoutMs > 0) {
      this.scheduleTimeout(info.id, params.timeoutMs);
    }

    return Ok(this.processes.get(info.id) ?? info);
  }

  async stop(params: StopProcessParams): Promise<Result<ProcessInfo, string>> {
    const process = this.processes.get(params.id);
    if (!process) return Err(`Process not found: ${params.id}`);

    const handle = this.handles.get(params.id);
    if (!handle) return Err(`Process not running: ${params.id}`);

    this.clearTimeout(params.id);

    const killed = await handle.kill(params.signal ?? "SIGTERM");
    if (!killed) return Err(`Failed to kill process: ${params.id}`);

    this.handles.delete(params.id);
    this.processes.updateStatus(params.id, "stopped", new Date().toISOString());

    return Ok(this.processes.get(params.id)!);
  }

  write(id: string, data: string): Result<boolean, string> {
    const handle = this.handles.get(id);
    if (!handle) return Err(`Process not running: ${id}`);

    const written = handle.write(data);
    return Ok(written);
  }

  getLogs(id: string, lastLines = 100) {
    return this.logs.get(id, lastLines);
  }

  getLogsByStream(id: string, stream: LogStream, lastLines = 100) {
    return this.logs.getByStream(id, stream, lastLines);
  }

  getLogEntries(id: string, lastEntries = 100) {
    return this.logs.getEntries(id, lastEntries);
  }

  getProcess(id: string) {
    return this.processes.get(id);
  }

  listProcesses() {
    return this.processes.list();
  }

  listRunning() {
    return this.processes.listByStatus("running");
  }

  restart(id: string): Result<ProcessInfo, string> {
    const original = this.processes.get(id);
    if (!original) return Err(`Process not found: ${id}`);

    // Stop if still running
    const handle = this.handles.get(id);
    if (handle) {
      handle.kill("SIGTERM");
      this.handles.delete(id);
      this.clearTimeout(id);
    }

    // Start new process with same config
    return this.start({
      command: original.command,
      cwd: original.cwd,
      env: original.env,
      label: original.label,
      timeoutMs: original.timeoutMs,
    });
  }

  purge(options: { keepRunning?: boolean; olderThanMs?: number } = {}): number {
    const { keepRunning = true, olderThanMs } = options;
    const now = Date.now();
    let purged = 0;

    for (const proc of this.processes.list()) {
      if (keepRunning && this.handles.has(proc.id)) continue;

      if (olderThanMs) {
        const startedAt = new Date(proc.startedAt).getTime();
        if (now - startedAt < olderThanMs) continue;
      }

      this.processes.delete(proc.id);
      this.logs.delete(proc.id);
      purged++;
    }

    return purged;
  }

  async stopAll(signal: Signal = "SIGTERM"): Promise<{ stopped: string[]; failed: string[] }> {
    const stopped: string[] = [];
    const failed: string[] = [];

    for (const [id, handle] of this.handles) {
      this.clearTimeout(id);
      const killed = await handle.kill(signal);
      if (killed) {
        this.processes.updateStatus(id, "stopped", new Date().toISOString());
        stopped.push(id);
      } else {
        failed.push(id);
      }
    }

    this.handles.clear();
    return { stopped, failed };
  }

  async sendSignal(id: string, signal: Signal): Promise<Result<boolean, string>> {
    const handle = this.handles.get(id);
    if (!handle) return Err(`Process not running: ${id}`);

    const sent = await handle.kill(signal);
    return Ok(sent);
  }

  searchLogs(id: string, pattern: string, options: { caseSensitive?: boolean } = {}): Result<string[], string> {
    const chunk = this.logs.get(id, 500);
    if (!chunk) return Ok([]);

    const flags = options.caseSensitive ? "g" : "gi";
    const regex = new RegExp(`.*${pattern}.*`, flags);
    const matches = chunk.logs.split("\n").filter((line) => regex.test(line));
    return Ok(matches);
  }

  getStats(): { total: number; running: number; exited: number; failed: number; stopped: number } {
    const all = this.processes.list();
    return {
      total: all.length,
      running: all.filter((p) => p.status === "running").length,
      exited: all.filter((p) => p.status === "exited").length,
      failed: all.filter((p) => p.status === "failed").length,
      stopped: all.filter((p) => p.status === "stopped").length,
    };
  }

  private scheduleTimeout(id: string, ms: number): void {
    const timeout = setTimeout(async () => {
      const handle = this.handles.get(id);
      if (handle) {
        await handle.kill("SIGKILL");
        this.handles.delete(id);
        this.processes.updateStatus(id, "timeout", new Date().toISOString());
      }
      this.timeouts.delete(id);
    }, ms);

    this.timeouts.set(id, timeout);
  }

  private clearTimeout(id: string): void {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  waitForPattern(
    id: string,
    pattern: string,
    options: { timeoutMs?: number; checkExisting?: boolean } = {}
  ): Promise<string> {
    const { timeoutMs = 30000, checkExisting = true } = options;

    // Check existing logs first
    if (checkExisting) {
      const chunk = this.logs.get(id, 500);
      if (chunk) {
        const regex = new RegExp(pattern);
        const match = chunk.logs.match(regex);
        if (match) {
          return Promise.resolve(match[0]);
        }
      }
    }

    // Check if process is still running
    if (!this.handles.has(id)) {
      const proc = this.processes.get(id);
      if (proc && proc.status !== "running") {
        return Promise.reject(new Error(`Process not running: ${proc.status}`));
      }
      return Promise.reject(new Error(`Process not found: ${id}`));
    }

    return new Promise((resolve, reject) => {
      const watcher: PatternWatcher = {
        pattern: new RegExp(pattern),
        resolve,
        reject,
      };

      if (timeoutMs > 0) {
        watcher.timeoutId = setTimeout(() => {
          this.removePatternWatcher(id, watcher);
          reject(new Error(`Timeout waiting for pattern: ${pattern}`));
        }, timeoutMs);
      }

      const watchers = this.patternWatchers.get(id) ?? [];
      watchers.push(watcher);
      this.patternWatchers.set(id, watchers);
    });
  }

  private checkPatternWatchers(id: string, chunk: string): void {
    const watchers = this.patternWatchers.get(id);
    if (!watchers || watchers.length === 0) return;

    const toRemove: PatternWatcher[] = [];
    for (const watcher of watchers) {
      const match = chunk.match(watcher.pattern);
      if (match) {
        if (watcher.timeoutId) clearTimeout(watcher.timeoutId);
        watcher.resolve(match[0]);
        toRemove.push(watcher);
      }
    }

    for (const watcher of toRemove) {
      this.removePatternWatcher(id, watcher);
    }
  }

  private rejectPatternWatchers(id: string, error: Error): void {
    const watchers = this.patternWatchers.get(id);
    if (!watchers) return;

    for (const watcher of watchers) {
      if (watcher.timeoutId) clearTimeout(watcher.timeoutId);
      watcher.reject(error);
    }
    this.patternWatchers.delete(id);
  }

  private removePatternWatcher(id: string, watcher: PatternWatcher): void {
    const watchers = this.patternWatchers.get(id);
    if (!watchers) return;

    const index = watchers.indexOf(watcher);
    if (index !== -1) {
      watchers.splice(index, 1);
    }
    if (watchers.length === 0) {
      this.patternWatchers.delete(id);
    }
  }
}

function generateLabel(command: string): string {
  // Extract meaningful label from command
  // "npm run dev" -> "npm:dev"
  // "python -m http.server 8000" -> "python:http.server"
  // "node server.js" -> "node:server.js"
  // "docker compose up" -> "docker:compose-up"

  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].replace(/^.*\//, ""); // basename

  // npm/pnpm/yarn scripts
  if (["npm", "pnpm", "yarn", "bun"].includes(cmd) && parts[1] === "run") {
    return `${cmd}:${parts[2] ?? "run"}`;
  }

  // python -m module
  if (["python", "python3"].includes(cmd) && parts[1] === "-m") {
    return `python:${parts[2] ?? "module"}`;
  }

  // docker compose
  if (cmd === "docker" && parts[1] === "compose") {
    return `docker:compose-${parts[2] ?? "up"}`;
  }

  // node/deno/bun with file
  if (["node", "deno", "bun", "ts-node", "tsx"].includes(cmd) && parts[1]) {
    const file = parts[1].replace(/^.*\//, "").replace(/\.[jt]sx?$/, "");
    return `${cmd}:${file}`;
  }

  // Generic: first word + second word if exists
  if (parts[1]) {
    const second = parts[1].replace(/^-+/, "").slice(0, 12);
    return `${cmd}:${second}`;
  }

  return cmd;
}

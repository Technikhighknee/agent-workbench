import { ProcessRepository } from "../../core/ports/ProcessRepository.js";
import { ProcessInfo, ProcessStatus } from "../../core/model.js";

export class InMemoryProcessRepository implements ProcessRepository {
  private readonly processes = new Map<string, ProcessInfo>();

  save(info: ProcessInfo): void {
    this.processes.set(info.id, { ...info });
  }

  updateStatus(id: string, status: ProcessStatus, endedAt?: string): void {
    const process = this.processes.get(id);
    if (process) {
      process.status = status;
      if (endedAt) process.endedAt = endedAt;
    }
  }

  updatePid(id: string, pid: number | null): void {
    const process = this.processes.get(id);
    if (process) {
      process.pid = pid;
    }
  }

  updateExitCode(id: string, code: number | null): void {
    const process = this.processes.get(id);
    if (process) {
      process.exitCode = code;
    }
  }

  get(id: string): ProcessInfo | null {
    const process = this.processes.get(id);
    return process ? { ...process } : null;
  }

  list(): ProcessInfo[] {
    return Array.from(this.processes.values())
      .map((p) => ({ ...p }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  listByStatus(status: ProcessStatus): ProcessInfo[] {
    return this.list().filter((p) => p.status === status);
  }

  delete(id: string): void {
    this.processes.delete(id);
  }

  clear(): void {
    this.processes.clear();
  }
}

import { ProcessInfo, ProcessStatus } from "../model.js";

export interface ProcessRepository {
  save(info: ProcessInfo): void;
  updateStatus(id: string, status: ProcessStatus, endedAt?: string): void;
  updatePid(id: string, pid: number | null): void;
  updateExitCode(id: string, code: number | null): void;
  get(id: string): ProcessInfo | null;
  list(): ProcessInfo[];
  listByStatus(status: ProcessStatus): ProcessInfo[];
  delete(id: string): void;
}

import { DatabaseSync } from "node:sqlite";
import { ProcessRepository } from "../../core/ports/ProcessRepository.js";
import { ProcessInfo, ProcessStatus } from "../../core/model.js";

interface SessionRow {
  id: string;
  command: string;
  args: string;
  cwd: string | null;
  env: string | null;
  label: string | null;
  status: string;
  pid: number | null;
  exit_code: number | null;
  timeout_ms: number | null;
  started_at: string;
  ended_at: string | null;
}

function rowToProcessInfo(row: SessionRow): ProcessInfo {
  return {
    id: row.id,
    command: row.command,
    args: JSON.parse(row.args) as string[],
    cwd: row.cwd ?? undefined,
    env: row.env ? (JSON.parse(row.env) as Record<string, string>) : undefined,
    label: row.label ?? undefined,
    status: row.status as ProcessStatus,
    pid: row.pid,
    exitCode: row.exit_code,
    timeoutMs: row.timeout_ms ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export class SQLiteProcessRepository implements ProcessRepository {
  constructor(private readonly db: DatabaseSync) {}

  save(info: ProcessInfo): void {
    this.db
      .prepare(
        `INSERT INTO process_session
         (id, command, args, cwd, env, label, status, pid, exit_code, timeout_ms, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        info.id,
        info.command,
        JSON.stringify(info.args),
        info.cwd ?? null,
        info.env ? JSON.stringify(info.env) : null,
        info.label ?? null,
        info.status,
        info.pid ?? null,
        info.exitCode ?? null,
        info.timeoutMs ?? null,
        info.startedAt,
        info.endedAt ?? null
      );
  }

  updateStatus(id: string, status: ProcessStatus, endedAt?: string): void {
    this.db
      .prepare(`UPDATE process_session SET status = ?, ended_at = ? WHERE id = ?`)
      .run(status, endedAt ?? null, id);
  }

  updatePid(id: string, pid: number | null): void {
    this.db.prepare(`UPDATE process_session SET pid = ? WHERE id = ?`).run(pid, id);
  }

  updateExitCode(id: string, code: number | null): void {
    this.db.prepare(`UPDATE process_session SET exit_code = ? WHERE id = ?`).run(code, id);
  }

  get(id: string): ProcessInfo | null {
    const row = this.db
      .prepare(`SELECT * FROM process_session WHERE id = ?`)
      .get(id) as SessionRow | undefined;

    return row ? rowToProcessInfo(row) : null;
  }

  list(): ProcessInfo[] {
    const rows = this.db
      .prepare(`SELECT * FROM process_session ORDER BY started_at DESC`)
      .all() as unknown as SessionRow[];

    return rows.map(rowToProcessInfo);
  }

  listByStatus(status: ProcessStatus): ProcessInfo[] {
    const rows = this.db
      .prepare(`SELECT * FROM process_session WHERE status = ? ORDER BY started_at DESC`)
      .all(status) as unknown as SessionRow[];

    return rows.map(rowToProcessInfo);
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM process_session WHERE id = ?`).run(id);
  }
}

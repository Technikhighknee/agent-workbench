import { DatabaseSync } from "node:sqlite";
import { LogRepository } from "../../core/ports/LogRepository.js";
import { LogChunk, LogStream, LogEntry } from "../../core/model.js";

interface LogRow {
  id: number;
  session_id: string;
  stream: string;
  chunk: string;
  created_at: string;
}

export class SQLiteLogRepository implements LogRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly maxChunks = 500
  ) {}

  append(sessionId: string, stream: LogStream, chunk: string): void {
    this.db
      .prepare(`INSERT INTO process_logs (session_id, stream, chunk) VALUES (?, ?, ?)`)
      .run(sessionId, stream, chunk);

    this.trimOldLogs(sessionId);
  }

  get(sessionId: string, lastLines = 100): LogChunk | null {
    const rows = this.db
      .prepare(
        `SELECT chunk FROM process_logs
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(sessionId, lastLines) as { chunk: string }[];

    if (rows.length === 0) return null;

    return {
      sessionId,
      logs: rows
        .reverse()
        .map((r) => r.chunk)
        .join(""),
    };
  }

  getByStream(sessionId: string, stream: LogStream, lastLines = 100): LogChunk | null {
    const rows = this.db
      .prepare(
        `SELECT chunk FROM process_logs
         WHERE session_id = ? AND stream = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(sessionId, stream, lastLines) as { chunk: string }[];

    if (rows.length === 0) return null;

    return {
      sessionId,
      logs: rows
        .reverse()
        .map((r) => r.chunk)
        .join(""),
    };
  }

  getEntries(sessionId: string, lastEntries = 100): LogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, stream, chunk, created_at FROM process_logs
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(sessionId, lastEntries) as unknown as LogRow[];

    return rows.reverse().map((row) => ({
      sessionId: row.session_id,
      stream: row.stream as LogStream,
      chunk: row.chunk,
      timestamp: row.created_at,
    }));
  }

  private trimOldLogs(sessionId: string): void {
    this.db
      .prepare(
        `DELETE FROM process_logs
         WHERE session_id = ?
         AND id NOT IN (
           SELECT id FROM process_logs
           WHERE session_id = ?
           ORDER BY id DESC
           LIMIT ?
         )`
      )
      .run(sessionId, sessionId, this.maxChunks);
  }

  delete(sessionId: string): void {
    this.db.prepare(`DELETE FROM process_logs WHERE session_id = ?`).run(sessionId);
  }
}

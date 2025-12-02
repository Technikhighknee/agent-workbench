/**
 * SQLite persistence for tasks.
 * Single table, simple operations, no abstraction layers.
 */

import Database from "better-sqlite3";
import type { Task, TaskStatus } from "./model.js";

/** Row shape from SQLite */
interface TaskRow {
  id: string;
  command: string;
  label: string | null;
  cwd: string | null;
  status: string;
  exit_code: number | null;
  started_at: string;
  ended_at: string | null;
  output: string;
  truncated: number;
}

/**
 * SQLite-backed task storage.
 *
 * Use ":memory:" for testing, file path for production.
 */
export class TaskStore {
  private db: Database.Database;

  // Prepared statements for performance
  private stmtInsert: Database.Statement;
  private stmtUpdate: Database.Statement;
  private stmtUpdateStatus: Database.Statement;
  private stmtAppendOutput: Database.Statement;
  private stmtGet: Database.Statement;
  private stmtList: Database.Statement;
  private stmtListRunning: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtMarkOrphaned: Database.Statement;
  private stmtCleanupOld: Database.Statement;
  private stmtCountCompleted: Database.Statement;
  private stmtDeleteOldest: Database.Statement;

  constructor(dbPath: string = "tasks.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL"); // Better concurrent performance
    this.db.pragma("synchronous = NORMAL"); // Good balance of safety/speed
    this.migrate();

    // Prepare all statements
    this.stmtInsert = this.db.prepare(`
      INSERT INTO tasks (id, command, label, cwd, status, exit_code, started_at, ended_at, output, truncated)
      VALUES (@id, @command, @label, @cwd, @status, @exitCode, @startedAt, @endedAt, @output, @truncated)
    `);

    this.stmtUpdate = this.db.prepare(`
      UPDATE tasks SET
        status = @status,
        exit_code = @exitCode,
        ended_at = @endedAt,
        output = @output,
        truncated = @truncated
      WHERE id = @id
    `);

    this.stmtUpdateStatus = this.db.prepare(`
      UPDATE tasks SET status = @status, exit_code = @exitCode, ended_at = @endedAt
      WHERE id = @id
    `);

    this.stmtAppendOutput = this.db.prepare(`
      UPDATE tasks SET
        output = output || @chunk,
        truncated = CASE WHEN length(output) + length(@chunk) > @maxSize THEN 1 ELSE truncated END
      WHERE id = @id
    `);

    this.stmtGet = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`);

    this.stmtList = this.db.prepare(`
      SELECT * FROM tasks ORDER BY started_at DESC
    `);

    this.stmtListRunning = this.db.prepare(`
      SELECT * FROM tasks WHERE status = 'running' ORDER BY started_at DESC
    `);

    this.stmtDelete = this.db.prepare(`DELETE FROM tasks WHERE id = ?`);

    this.stmtMarkOrphaned = this.db.prepare(`
      UPDATE tasks SET status = 'orphaned', ended_at = @now
      WHERE status = 'running'
    `);

    this.stmtCleanupOld = this.db.prepare(`
      DELETE FROM tasks
      WHERE status != 'running'
        AND started_at < @cutoff
    `);

    this.stmtCountCompleted = this.db.prepare(`
      SELECT COUNT(*) as count FROM tasks WHERE status != 'running'
    `);

    this.stmtDeleteOldest = this.db.prepare(`
      DELETE FROM tasks WHERE id IN (
        SELECT id FROM tasks
        WHERE status != 'running'
        ORDER BY started_at ASC
        LIMIT @count
      )
    `);
  }

  /**
   * Create database schema if it doesn't exist.
   */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        label TEXT,
        cwd TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        exit_code INTEGER,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        output TEXT NOT NULL DEFAULT '',
        truncated INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_started ON tasks(started_at);
    `);
  }

  /**
   * Save a new task to the store.
   */
  save(task: Task): void {
    this.stmtInsert.run({
      id: task.id,
      command: task.command,
      label: task.label,
      cwd: task.cwd,
      status: task.status,
      exitCode: task.exitCode,
      startedAt: task.startedAt.toISOString(),
      endedAt: task.endedAt?.toISOString() ?? null,
      output: task.output,
      truncated: task.truncated ? 1 : 0,
    });
  }

  /**
   * Update an existing task.
   */
  update(task: Task): void {
    this.stmtUpdate.run({
      id: task.id,
      status: task.status,
      exitCode: task.exitCode,
      endedAt: task.endedAt?.toISOString() ?? null,
      output: task.output,
      truncated: task.truncated ? 1 : 0,
    });
  }

  /**
   * Update just the status fields (faster than full update).
   */
  updateStatus(id: string, status: TaskStatus, exitCode: number | null, endedAt: Date | null): void {
    this.stmtUpdateStatus.run({
      id,
      status,
      exitCode,
      endedAt: endedAt?.toISOString() ?? null,
    });
  }

  /**
   * Append output chunk to a task.
   * Handles truncation automatically.
   */
  appendOutput(id: string, chunk: string, maxSize: number): void {
    this.stmtAppendOutput.run({ id, chunk, maxSize });
  }

  /**
   * Get a task by ID.
   */
  get(id: string): Task | null {
    const row = this.stmtGet.get(id) as TaskRow | undefined;
    return row ? this.rowToTask(row) : null;
  }

  /**
   * List all tasks, optionally filtered to running only.
   */
  list(runningOnly: boolean = false): Task[] {
    const rows = (runningOnly ? this.stmtListRunning : this.stmtList).all() as TaskRow[];
    return rows.map((row) => this.rowToTask(row));
  }

  /**
   * Delete a task by ID.
   */
  delete(id: string): boolean {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  /**
   * Mark all "running" tasks as "orphaned".
   * Call this on server startup to handle tasks from previous run.
   *
   * @returns Number of tasks marked as orphaned
   */
  markOrphaned(): number {
    const result = this.stmtMarkOrphaned.run({ now: new Date().toISOString() });
    return result.changes;
  }

  /**
   * Delete completed tasks older than the specified age.
   *
   * @param maxAgeMs Maximum age in milliseconds
   * @returns Number of tasks deleted
   */
  cleanupOld(maxAgeMs: number): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = this.stmtCleanupOld.run({ cutoff });
    return result.changes;
  }

  /**
   * Enforce maximum number of completed tasks.
   * Deletes oldest completed tasks if over limit.
   *
   * @param maxCount Maximum number of completed tasks to keep
   * @returns Number of tasks deleted
   */
  enforceMaxCompleted(maxCount: number): number {
    const countResult = this.stmtCountCompleted.get() as { count: number };
    const excess = countResult.count - maxCount;

    if (excess <= 0) return 0;

    const result = this.stmtDeleteOldest.run({ count: excess });
    return result.changes;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert a database row to a Task object.
   */
  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      command: row.command,
      label: row.label,
      cwd: row.cwd,
      status: row.status as TaskStatus,
      exitCode: row.exit_code,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : null,
      output: row.output,
      truncated: row.truncated === 1,
    };
  }
}

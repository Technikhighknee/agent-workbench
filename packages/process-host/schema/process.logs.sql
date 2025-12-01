CREATE TABLE IF NOT EXISTS process_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'stdout',
  chunk TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES process_session(id)
);

CREATE INDEX IF NOT EXISTS idx_process_logs_session_id ON process_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_process_logs_session_stream ON process_logs(session_id, stream);

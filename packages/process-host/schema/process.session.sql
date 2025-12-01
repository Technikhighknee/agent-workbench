CREATE TABLE IF NOT EXISTS process_session (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  args TEXT NOT NULL,
  cwd TEXT,
  env TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'starting',
  pid INTEGER,
  exit_code INTEGER,
  timeout_ms INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_process_session_status ON process_session(status);

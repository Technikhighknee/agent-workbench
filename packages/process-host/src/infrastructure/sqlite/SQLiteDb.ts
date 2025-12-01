import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, "../../../");

export interface DbConfig {
  dbPath: string;
  schemaDir: string;
}

const DEFAULT_CONFIG: DbConfig = {
  dbPath: path.join(PKG_ROOT, "process-host.db"),
  schemaDir: path.join(PKG_ROOT, "schema"),
};

export function createDb(config: Partial<DbConfig> = {}): DatabaseSync {
  const { dbPath, schemaDir } = { ...DEFAULT_CONFIG, ...config };

  const db = new DatabaseSync(dbPath);

  db.exec(fs.readFileSync(path.join(schemaDir, "process.session.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(schemaDir, "process.logs.sql"), "utf8"));

  return db;
}

let sharedDb: DatabaseSync | null = null;

export function getDb(config?: Partial<DbConfig>): DatabaseSync {
  if (!sharedDb) {
    sharedDb = createDb(config);
  }
  return sharedDb;
}

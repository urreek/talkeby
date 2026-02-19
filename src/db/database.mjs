import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.mjs";

function ensureParentDirectory(filePath) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
}

export function bootstrapDatabase(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      request TEXT NOT NULL,
      project_name TEXT NOT NULL,
      workdir TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      queued_at TEXT,
      pending_approval_at TEXT,
      approved_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      denied_at TEXT,
      summary TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_settings (
      chat_id TEXT PRIMARY KEY,
      execution_mode TEXT NOT NULL,
      project_name TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_chat_id ON jobs (chat_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at);
    CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events (job_id);
    CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON job_events (created_at);
  `);
}

export function createDatabase({ filePath }) {
  ensureParentDirectory(filePath);
  const sqlite = new Database(filePath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  bootstrapDatabase(sqlite);
  const db = drizzle(sqlite, { schema });

  return {
    sqlite,
    db,
  };
}

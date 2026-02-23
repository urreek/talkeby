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
  // Phase 1: Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      bootstrap_prompt TEXT,
      bootstrap_applied_at TEXT,
      auto_trim_context INTEGER NOT NULL DEFAULT 1,
      token_budget INTEGER NOT NULL DEFAULT 12000,
      token_used INTEGER NOT NULL DEFAULT 0,
      token_used_exact INTEGER NOT NULL DEFAULT 0,
      token_used_estimated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      thread_id TEXT,
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
      cancelled_at TEXT,
      execution_lease_id TEXT,
      execution_attempt INTEGER NOT NULL DEFAULT 0,
      resumed_from_job_id TEXT,
      token_source TEXT,
      token_input INTEGER,
      token_output INTEGER,
      token_total INTEGER,
      provider_cost_usd TEXT,
      summary TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_settings (
      chat_id TEXT PRIMARY KEY,
      execution_mode TEXT NOT NULL,
      project_name TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      created_by_chat_id TEXT,
      created_at TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS runtime_approvals (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      thread_id TEXT,
      method TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      summary TEXT NOT NULL,
      reason TEXT,
      command TEXT,
      cwd TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by_chat_id TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Phase 2: Migrations (must run before indexes on new columns)
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN thread_id TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN cli_session_id TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN bootstrap_prompt TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN bootstrap_applied_at TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN token_budget INTEGER NOT NULL DEFAULT 12000`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN token_used INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN auto_trim_context INTEGER NOT NULL DEFAULT 1`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN token_used_exact INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE threads ADD COLUMN token_used_estimated INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN execution_lease_id TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN execution_attempt INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN cancelled_at TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN resumed_from_job_id TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN token_source TEXT`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN token_input INTEGER`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN token_output INTEGER`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN token_total INTEGER`);
  } catch {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN provider_cost_usd TEXT`);
  } catch {
    // Column already exists
  }

  // Phase 3: Indexes (safe now that all columns exist)
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_chat_id ON jobs (chat_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_thread_id ON jobs (thread_id);
    CREATE INDEX IF NOT EXISTS idx_threads_project ON threads (project_name);
    CREATE INDEX IF NOT EXISTS idx_projects_name ON projects (name);
    CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings (key);
    CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events (job_id);
    CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON job_events (created_at);
    CREATE INDEX IF NOT EXISTS idx_runtime_approvals_chat ON runtime_approvals (chat_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_runtime_approvals_job ON runtime_approvals (job_id, created_at);
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

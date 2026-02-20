import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobsTable = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  request: text("request").notNull(),
  projectName: text("project_name").notNull(),
  workdir: text("workdir").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  queuedAt: text("queued_at"),
  pendingApprovalAt: text("pending_approval_at"),
  approvedAt: text("approved_at"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  deniedAt: text("denied_at"),
  summary: text("summary"),
  error: text("error"),
});

export const chatSettingsTable = sqliteTable("chat_settings", {
  chatId: text("chat_id").primaryKey(),
  executionMode: text("execution_mode").notNull(),
  projectName: text("project_name"),
  updatedAt: text("updated_at").notNull(),
});

export const projectsTable = sqliteTable("projects", {
  name: text("name").primaryKey(),
  path: text("path").notNull(),
  createdByChatId: text("created_by_chat_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobEventsTable = sqliteTable("job_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull(),
  chatId: text("chat_id").notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull(),
});

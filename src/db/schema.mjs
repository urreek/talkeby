import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const threadsTable = sqliteTable("threads", {
  id: text("id").primaryKey(),
  projectName: text("project_name").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  cliSessionId: text("cli_session_id"),
  bootstrapPrompt: text("bootstrap_prompt"),
  bootstrapAppliedAt: text("bootstrap_applied_at"),
  autoTrimContext: integer("auto_trim_context").notNull().default(1),
  tokenBudget: integer("token_budget").notNull().default(12000),
  tokenUsed: integer("token_used").notNull().default(0),
  tokenUsedExact: integer("token_used_exact").notNull().default(0),
  tokenUsedEstimated: integer("token_used_estimated").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appSettingsTable = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobsTable = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  threadId: text("thread_id"),
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
  cancelledAt: text("cancelled_at"),
  executionLeaseId: text("execution_lease_id"),
  executionAttempt: integer("execution_attempt").notNull().default(0),
  resumedFromJobId: text("resumed_from_job_id"),
  tokenSource: text("token_source"),
  tokenInput: integer("token_input"),
  tokenOutput: integer("token_output"),
  tokenTotal: integer("token_total"),
  providerCostUsd: text("provider_cost_usd"),
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

export const runtimeApprovalsTable = sqliteTable("runtime_approvals", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  chatId: text("chat_id").notNull(),
  jobId: text("job_id").notNull(),
  threadId: text("thread_id"),
  method: text("method").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  riskLevel: text("risk_level").notNull(),
  summary: text("summary").notNull(),
  reason: text("reason"),
  command: text("command"),
  cwd: text("cwd"),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolvedByChatId: text("resolved_by_chat_id"),
});

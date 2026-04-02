import { and, asc, desc, eq, gt, sql } from "drizzle-orm";

import {
  appSettingsTable,
  chatSettingsTable,
  jobEventsTable,
  jobsTable,
  projectsTable,
  runtimeApprovalsTable,
  threadProviderSessionsTable,
  threadsTable,
} from "./schema.mjs";

function nowIso() {
  return new Date().toISOString();
}

function parseEventPayload(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeEventPayload(payload) {
  if (payload === undefined || payload === null) {
    return null;
  }
  return JSON.stringify(payload);
}

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildThreadProviderSessionId(threadId, provider) {
  const safeThreadId = String(threadId || "").trim();
  const safeProvider = normalizeProvider(provider);
  if (!safeThreadId || !safeProvider) {
    return "";
  }
  return `${safeThreadId}:${safeProvider}`;
}

export class TalkebyRepository {
  constructor(db) {
    this.db = db;
  }

  listRecentJobs(limit = 100) {
    return this.db
      .select()
      .from(jobsTable)
      .orderBy(desc(jobsTable.createdAt))
      .limit(limit)
      .all();
  }

  getJobById(jobId) {
    if (!jobId) {
      return null;
    }
    return this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId))
      .limit(1)
      .get();
  }

  insertJob(job) {
    const tokenInput = Number.parseInt(String(job.tokenInput ?? ""), 10);
    const tokenOutput = Number.parseInt(String(job.tokenOutput ?? ""), 10);
    const tokenTotal = Number.parseInt(String(job.tokenTotal ?? ""), 10);
    const row = {
      id: job.id,
      chatId: String(job.chatId),
      threadId: job.threadId || null,
      request: String(job.request),
      projectName: String(job.projectName),
      workdir: String(job.workdir),
      provider: job.provider ? normalizeProvider(job.provider) : null,
      status: String(job.status),
      createdAt: job.createdAt || nowIso(),
      queuedAt: job.queuedAt || null,
      pendingApprovalAt: job.pendingApprovalAt || null,
      approvedAt: job.approvedAt || null,
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      deniedAt: job.deniedAt || null,
      cancelledAt: job.cancelledAt || null,
      executionLeaseId: job.executionLeaseId || null,
      executionAttempt: Number.isFinite(Number(job.executionAttempt))
        ? Number(job.executionAttempt)
        : 0,
      resumedFromJobId: job.resumedFromJobId || null,
      tokenSource: job.tokenSource || null,
      tokenInput: Number.isFinite(tokenInput) ? Math.max(0, tokenInput) : null,
      tokenOutput: Number.isFinite(tokenOutput) ? Math.max(0, tokenOutput) : null,
      tokenTotal: Number.isFinite(tokenTotal) ? Math.max(0, tokenTotal) : null,
      providerCostUsd: job.providerCostUsd === undefined || job.providerCostUsd === null
        ? null
        : String(job.providerCostUsd),
      summary: job.summary || null,
      error: job.error || null,
    };

    this.db.insert(jobsTable).values(row).run();
    return this.getJobById(job.id);
  }

  updateJob(jobId, patch) {
    if (!jobId) {
      return null;
    }

    const update = {};
    if ("status" in patch) update.status = patch.status;
    if ("queuedAt" in patch) update.queuedAt = patch.queuedAt || null;
    if ("pendingApprovalAt" in patch) update.pendingApprovalAt = patch.pendingApprovalAt || null;
    if ("approvedAt" in patch) update.approvedAt = patch.approvedAt || null;
    if ("startedAt" in patch) update.startedAt = patch.startedAt || null;
    if ("completedAt" in patch) update.completedAt = patch.completedAt || null;
    if ("deniedAt" in patch) update.deniedAt = patch.deniedAt || null;
    if ("cancelledAt" in patch) update.cancelledAt = patch.cancelledAt || null;
    if ("executionLeaseId" in patch) update.executionLeaseId = patch.executionLeaseId || null;
    if ("executionAttempt" in patch) update.executionAttempt = Number(patch.executionAttempt) || 0;
    if ("resumedFromJobId" in patch) update.resumedFromJobId = patch.resumedFromJobId || null;
    if ("tokenSource" in patch) update.tokenSource = patch.tokenSource || null;
    if ("tokenInput" in patch) {
      const parsed = Number.parseInt(String(patch.tokenInput ?? ""), 10);
      update.tokenInput = Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }
    if ("tokenOutput" in patch) {
      const parsed = Number.parseInt(String(patch.tokenOutput ?? ""), 10);
      update.tokenOutput = Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }
    if ("tokenTotal" in patch) {
      const parsed = Number.parseInt(String(patch.tokenTotal ?? ""), 10);
      update.tokenTotal = Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }
    if ("providerCostUsd" in patch) {
      update.providerCostUsd = patch.providerCostUsd === undefined || patch.providerCostUsd === null
        ? null
        : String(patch.providerCostUsd);
    }
    if ("summary" in patch) update.summary = patch.summary || null;
    if ("error" in patch) update.error = patch.error || null;
    if ("projectName" in patch) update.projectName = patch.projectName || null;
    if ("workdir" in patch) update.workdir = patch.workdir || null;
    if ("request" in patch) update.request = patch.request || null;
    if ("provider" in patch) update.provider = patch.provider ? normalizeProvider(patch.provider) : null;

    if (Object.keys(update).length === 0) {
      return this.getJobById(jobId);
    }

    this.db
      .update(jobsTable)
      .set(update)
      .where(eq(jobsTable.id, jobId))
      .run();

    return this.getJobById(jobId);
  }

  claimJobForExecution({ jobId, leaseId, startedAt }) {
    if (!jobId || !leaseId || !startedAt) {
      return null;
    }

    this.db
      .update(jobsTable)
      .set({
        status: "running",
        startedAt: String(startedAt),
        executionLeaseId: String(leaseId),
        executionAttempt: sql`coalesce(${jobsTable.executionAttempt}, 0) + 1`,
      })
      .where(and(eq(jobsTable.id, String(jobId)), eq(jobsTable.status, "queued")))
      .run();

    const claimed = this.getJobById(jobId);
    if (!claimed || String(claimed.status) !== "running" || String(claimed.executionLeaseId || "") !== String(leaseId)) {
      return null;
    }
    return claimed;
  }

  upsertChatSettings({ chatId, executionMode, projectName }) {
    const row = {
      chatId: String(chatId),
      executionMode: String(executionMode),
      projectName: projectName ? String(projectName) : null,
      updatedAt: nowIso(),
    };

    this.db
      .insert(chatSettingsTable)
      .values(row)
      .onConflictDoUpdate({
        target: chatSettingsTable.chatId,
        set: {
          executionMode: row.executionMode,
          projectName: row.projectName,
          updatedAt: row.updatedAt,
        },
      })
      .run();

    return this.getChatSettings(chatId);
  }

  getChatSettings(chatId) {
    if (!chatId) {
      return null;
    }
    return this.db
      .select()
      .from(chatSettingsTable)
      .where(eq(chatSettingsTable.chatId, String(chatId)))
      .limit(1)
      .get();
  }

  listChatSettings() {
    return this.db
      .select()
      .from(chatSettingsTable)
      .orderBy(asc(chatSettingsTable.chatId))
      .all();
  }

  listProjects() {
    return this.db
      .select()
      .from(projectsTable)
      .orderBy(asc(projectsTable.name))
      .all();
  }

  upsertProject({ name, path, createdByChatId = "" }) {
    const existing = this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.name, String(name)))
      .limit(1)
      .get();

    const row = {
      name: String(name),
      path: String(path),
      createdByChatId: createdByChatId ? String(createdByChatId) : null,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    this.db
      .insert(projectsTable)
      .values(row)
      .onConflictDoUpdate({
        target: projectsTable.name,
        set: {
          path: row.path,
          createdByChatId: row.createdByChatId,
          updatedAt: row.updatedAt,
        },
      })
      .run();

    return this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.name, row.name))
      .limit(1)
      .get();
  }

  addJobEvent({ jobId, chatId, eventType, message, payload }) {
    const row = {
      jobId: String(jobId),
      chatId: String(chatId),
      eventType: String(eventType),
      message: String(message),
      payloadJson: serializeEventPayload(payload),
      createdAt: nowIso(),
    };

    this.db.insert(jobEventsTable).values(row).run();
    return this.getLatestEvent();
  }

  getLatestEvent() {
    const row = this.db
      .select()
      .from(jobEventsTable)
      .orderBy(desc(jobEventsTable.id))
      .limit(1)
      .get();

    if (!row) {
      return null;
    }
    return {
      ...row,
      payload: parseEventPayload(row.payloadJson),
    };
  }

  listEventsAfter({ afterEventId = 0, limit = 200 }) {
    const numericAfter = Number.parseInt(String(afterEventId || 0), 10);
    const safeAfter = Number.isFinite(numericAfter) ? numericAfter : 0;

    const rows = safeAfter > 0
      ? this.db
          .select()
          .from(jobEventsTable)
          .where(gt(jobEventsTable.id, safeAfter))
          .orderBy(asc(jobEventsTable.id))
          .limit(limit)
          .all()
      : this.db
          .select()
          .from(jobEventsTable)
          .orderBy(desc(jobEventsTable.id))
          .limit(limit)
          .all()
          .reverse();

    return rows.map((row) => ({
      ...row,
      payload: parseEventPayload(row.payloadJson),
    }));
  }

  listEventsForJob({ jobId, limit = 200 }) {
    if (!jobId) {
      return [];
    }

    const rows = this.db
      .select()
      .from(jobEventsTable)
      .where(eq(jobEventsTable.jobId, String(jobId)))
      .orderBy(desc(jobEventsTable.id))
      .limit(limit)
      .all()
      .reverse();

    return rows.map((row) => ({
      ...row,
      payload: parseEventPayload(row.payloadJson),
    }));
  }

  // ── Threads ──

  listThreadsByProject(projectName) {
    return this.db
      .select()
      .from(threadsTable)
      .where(and(
        eq(threadsTable.projectName, String(projectName)),
        eq(threadsTable.status, "active"),
      ))
      .orderBy(desc(threadsTable.updatedAt))
      .all();
  }

  listRecentThreads(limit = 50) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    return this.db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.status, "active"))
      .orderBy(desc(threadsTable.updatedAt))
      .limit(safeLimit)
      .all();
  }

  getThread(threadId) {
    if (!threadId) return null;
    return this.db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, String(threadId)))
      .limit(1)
      .get();
  }

  getThreadByCliSessionId(cliSessionId) {
    if (!cliSessionId) return null;
    return this.db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.cliSessionId, String(cliSessionId)))
      .limit(1)
      .get();
  }

  createThread({
    id,
    projectName,
    title,
    status = "active",
    lastProvider = "",
    lastModel = "",
    lastReasoningEffort = "",
    cliSessionId = "",
    tokenBudget = 12000,
    autoTrimContext = true,
    createdAt = "",
    updatedAt = "",
    tokenUsed = 0,
    tokenUsedExact = 0,
    tokenUsedEstimated = 0,
  }) {
    const now = nowIso();
    const safeCreatedAt = createdAt || now;
    const safeUpdatedAt = updatedAt || safeCreatedAt;
    const row = {
      id: String(id),
      projectName: String(projectName),
      title: String(title),
      status: String(status || "active"),
      lastProvider: textValue(lastProvider).toLowerCase() || null,
      lastModel: textValue(lastModel) || null,
      lastReasoningEffort: textValue(lastReasoningEffort).toLowerCase() || null,
      cliSessionId: cliSessionId ? String(cliSessionId) : null,
      autoTrimContext: autoTrimContext ? 1 : 0,
      tokenBudget: Math.max(0, Number.parseInt(String(tokenBudget || 0), 10) || 0),
      tokenUsed: Math.max(0, Number.parseInt(String(tokenUsed || 0), 10) || 0),
      tokenUsedExact: Math.max(0, Number.parseInt(String(tokenUsedExact || 0), 10) || 0),
      tokenUsedEstimated: Math.max(0, Number.parseInt(String(tokenUsedEstimated || 0), 10) || 0),
      createdAt: safeCreatedAt,
      updatedAt: safeUpdatedAt,
    };
    this.db.insert(threadsTable).values(row).run();
    return this.getThread(id);
  }

  updateThread(threadId, patch) {
    if (!threadId) return null;
    const update = { updatedAt: nowIso() };
    if ("title" in patch) update.title = patch.title;
    if ("status" in patch) update.status = patch.status;
    if ("lastProvider" in patch) update.lastProvider = textValue(patch.lastProvider).toLowerCase() || null;
    if ("lastModel" in patch) update.lastModel = textValue(patch.lastModel) || null;
    if ("lastReasoningEffort" in patch) {
      update.lastReasoningEffort = textValue(patch.lastReasoningEffort).toLowerCase() || null;
    }
    if ("cliSessionId" in patch) update.cliSessionId = patch.cliSessionId;
    if ("autoTrimContext" in patch) update.autoTrimContext = patch.autoTrimContext ? 1 : 0;
    if ("tokenBudget" in patch) {
      const parsed = Number.parseInt(String(patch.tokenBudget || 0), 10);
      update.tokenBudget = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    if ("tokenUsed" in patch) {
      const parsed = Number.parseInt(String(patch.tokenUsed || 0), 10);
      update.tokenUsed = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    if ("tokenUsedExact" in patch) {
      const parsed = Number.parseInt(String(patch.tokenUsedExact || 0), 10);
      update.tokenUsedExact = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    if ("tokenUsedEstimated" in patch) {
      const parsed = Number.parseInt(String(patch.tokenUsedEstimated || 0), 10);
      update.tokenUsedEstimated = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    this.db
      .update(threadsTable)
      .set(update)
      .where(eq(threadsTable.id, String(threadId)))
      .run();
    return this.getThread(threadId);
  }

  listThreadProviderSessions(threadId) {
    if (!threadId) {
      return [];
    }
    return this.db
      .select()
      .from(threadProviderSessionsTable)
      .where(eq(threadProviderSessionsTable.threadId, String(threadId)))
      .orderBy(asc(threadProviderSessionsTable.provider))
      .all();
  }

  getThreadProviderSession(threadId, provider) {
    const id = buildThreadProviderSessionId(threadId, provider);
    if (!id) {
      return null;
    }

    const session = this.db
      .select()
      .from(threadProviderSessionsTable)
      .where(eq(threadProviderSessionsTable.id, id))
      .limit(1)
      .get();
    if (session) {
      return session;
    }

    if (normalizeProvider(provider) !== "codex") {
      return null;
    }

    const thread = this.getThread(threadId);
    const sessionId = String(thread?.cliSessionId || "").trim();
    if (!sessionId) {
      return null;
    }

    const latestCompleted = this.listJobsByThread(threadId, 5000)
      .filter((job) => {
        if (String(job?.status || "").toLowerCase() !== "completed") {
          return false;
        }
        const jobProvider = normalizeProvider(job?.provider);
        return !jobProvider || jobProvider === "codex";
      })
      .at(-1);

    return {
      id,
      threadId: String(threadId),
      provider: "codex",
      sessionId,
      syncedJobId: latestCompleted?.id || "",
      createdAt: thread?.createdAt || nowIso(),
      updatedAt: thread?.updatedAt || thread?.createdAt || nowIso(),
    };
  }

  upsertThreadProviderSession({
    threadId,
    provider,
    sessionId,
    syncedJobId = "",
  }) {
    const id = buildThreadProviderSessionId(threadId, provider);
    const safeSessionId = String(sessionId || "").trim();
    const safeProvider = normalizeProvider(provider);
    if (!id || !safeSessionId) {
      return null;
    }

    const existing = this.getThreadProviderSession(threadId, safeProvider);
    const row = {
      id,
      threadId: String(threadId),
      provider: safeProvider,
      sessionId: safeSessionId,
      syncedJobId: syncedJobId ? String(syncedJobId) : null,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    this.db
      .insert(threadProviderSessionsTable)
      .values(row)
      .onConflictDoUpdate({
        target: threadProviderSessionsTable.id,
        set: {
          sessionId: row.sessionId,
          syncedJobId: row.syncedJobId,
          updatedAt: row.updatedAt,
        },
      })
      .run();

    if (safeProvider === "codex") {
      this.updateThread(threadId, {
        cliSessionId: safeSessionId,
      });
    }

    return this.getThreadProviderSession(threadId, safeProvider);
  }

  addThreadTokenUsage({ threadId, total, source = "estimate" }) {
    if (!threadId) {
      return null;
    }
    const usage = Number.parseInt(String(total || 0), 10);
    if (!Number.isFinite(usage) || usage <= 0) {
      return this.getThread(threadId);
    }
    const safeSource = String(source || "").toLowerCase() === "exact" ? "exact" : "estimate";
    this.db
      .update(threadsTable)
      .set({
        tokenUsed: sql`coalesce(${threadsTable.tokenUsed}, 0) + ${usage}`,
        tokenUsedExact: safeSource === "exact"
          ? sql`coalesce(${threadsTable.tokenUsedExact}, 0) + ${usage}`
          : sql`coalesce(${threadsTable.tokenUsedExact}, 0)`,
        tokenUsedEstimated: safeSource === "exact"
          ? sql`coalesce(${threadsTable.tokenUsedEstimated}, 0)`
          : sql`coalesce(${threadsTable.tokenUsedEstimated}, 0) + ${usage}`,
        updatedAt: nowIso(),
      })
      .where(eq(threadsTable.id, String(threadId)))
      .run();
    return this.getThread(threadId);
  }

  // ── App settings ──

  getAppSetting(key) {
    if (!key) {
      return null;
    }
    return this.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, String(key)))
      .limit(1)
      .get();
  }

  setAppSetting({ key, value }) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }
    const row = {
      key: normalizedKey,
      value: String(value || ""),
      updatedAt: nowIso(),
    };

    this.db
      .insert(appSettingsTable)
      .values(row)
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: row.value,
          updatedAt: row.updatedAt,
        },
      })
      .run();

    return this.getAppSetting(normalizedKey);
  }

  listJobsByThread(threadId, limit = 100) {
    if (!threadId) return [];
    const rows = this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.threadId, String(threadId)))
      .orderBy(desc(jobsTable.createdAt))
      .limit(limit)
      .all();
    return rows.reverse();
  }

  deleteThread(threadId) {
    if (!threadId) return;
    // Delete associated jobs first
    this.db
      .delete(jobsTable)
      .where(eq(jobsTable.threadId, String(threadId)))
      .run();
    this.db
      .delete(threadProviderSessionsTable)
      .where(eq(threadProviderSessionsTable.threadId, String(threadId)))
      .run();
    this.db
      .delete(threadsTable)
      .where(eq(threadsTable.id, String(threadId)))
      .run();
  }

  deleteProject(name) {
    if (!name) return;
    this.db
      .delete(projectsTable)
      .where(eq(projectsTable.name, String(name)))
      .run();
  }

  // ── Runtime approvals ──

  insertRuntimeApproval(input) {
    const row = {
      id: String(input.id),
      provider: String(input.provider || "codex"),
      chatId: String(input.chatId),
      jobId: String(input.jobId),
      threadId: input.threadId ? String(input.threadId) : null,
      method: String(input.method || ""),
      kind: String(input.kind || ""),
      status: String(input.status || "pending"),
      riskLevel: String(input.riskLevel || "medium"),
      summary: String(input.summary || ""),
      reason: input.reason ? String(input.reason) : null,
      command: input.command ? String(input.command) : null,
      cwd: input.cwd ? String(input.cwd) : null,
      payloadJson: serializeEventPayload(input.payload),
      createdAt: input.createdAt || nowIso(),
      resolvedAt: input.resolvedAt || null,
      resolvedByChatId: input.resolvedByChatId ? String(input.resolvedByChatId) : null,
    };

    this.db.insert(runtimeApprovalsTable).values(row).run();
    return this.getRuntimeApprovalById(row.id);
  }

  getRuntimeApprovalById(id) {
    if (!id) {
      return null;
    }
    const row = this.db
      .select()
      .from(runtimeApprovalsTable)
      .where(eq(runtimeApprovalsTable.id, String(id)))
      .limit(1)
      .get();
    if (!row) {
      return null;
    }
    return {
      ...row,
      payload: parseEventPayload(row.payloadJson),
    };
  }

  listRuntimeApprovals({ chatId = "", jobId = "", status = "", limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
    const statusValue = String(status || "").trim().toLowerCase();

    let query = this.db
      .select()
      .from(runtimeApprovalsTable)
      .orderBy(desc(runtimeApprovalsTable.createdAt))
      .limit(safeLimit);

    if (chatId && jobId && statusValue) {
      query = this.db
        .select()
        .from(runtimeApprovalsTable)
        .where(
          and(
            eq(runtimeApprovalsTable.chatId, String(chatId)),
            eq(runtimeApprovalsTable.jobId, String(jobId)),
            eq(runtimeApprovalsTable.status, statusValue),
          ),
        )
        .orderBy(desc(runtimeApprovalsTable.createdAt))
        .limit(safeLimit);
    } else if (chatId && jobId) {
      query = this.db
        .select()
        .from(runtimeApprovalsTable)
        .where(
          and(
            eq(runtimeApprovalsTable.chatId, String(chatId)),
            eq(runtimeApprovalsTable.jobId, String(jobId)),
          ),
        )
        .orderBy(desc(runtimeApprovalsTable.createdAt))
        .limit(safeLimit);
    } else if (chatId && statusValue) {
      query = this.db
        .select()
        .from(runtimeApprovalsTable)
        .where(
          and(
            eq(runtimeApprovalsTable.chatId, String(chatId)),
            eq(runtimeApprovalsTable.status, statusValue),
          ),
        )
        .orderBy(desc(runtimeApprovalsTable.createdAt))
        .limit(safeLimit);
    } else if (chatId) {
      query = this.db
        .select()
        .from(runtimeApprovalsTable)
        .where(eq(runtimeApprovalsTable.chatId, String(chatId)))
        .orderBy(desc(runtimeApprovalsTable.createdAt))
        .limit(safeLimit);
    } else if (statusValue) {
      query = this.db
        .select()
        .from(runtimeApprovalsTable)
        .where(eq(runtimeApprovalsTable.status, statusValue))
        .orderBy(desc(runtimeApprovalsTable.createdAt))
        .limit(safeLimit);
    } else if (jobId) {
      query = this.db
        .select()
        .from(runtimeApprovalsTable)
        .where(eq(runtimeApprovalsTable.jobId, String(jobId)))
        .orderBy(desc(runtimeApprovalsTable.createdAt))
        .limit(safeLimit);
    }

    return query.all().map((row) => ({
      ...row,
      payload: parseEventPayload(row.payloadJson),
    }));
  }

  resolveRuntimeApproval({ id, status, resolvedByChatId = "" }) {
    if (!id || !status) {
      return null;
    }

    this.db
      .update(runtimeApprovalsTable)
      .set({
        status: String(status),
        resolvedAt: nowIso(),
        resolvedByChatId: resolvedByChatId ? String(resolvedByChatId) : null,
      })
      .where(
        and(
          eq(runtimeApprovalsTable.id, String(id)),
          eq(runtimeApprovalsTable.status, "pending"),
        ),
      )
      .run();

    return this.getRuntimeApprovalById(id);
  }

  denyPendingRuntimeApprovals(reason = "Process restarted before decision.") {
    const pending = this.listRuntimeApprovals({ status: "pending", limit: 10000 });
    const now = nowIso();
    this.db
      .update(runtimeApprovalsTable)
      .set({
        status: "denied",
        reason: String(reason),
        resolvedAt: now,
      })
      .where(eq(runtimeApprovalsTable.status, "pending"))
      .run();
    return pending.length;
  }
}


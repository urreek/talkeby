import { asc, desc, eq, gt } from "drizzle-orm";

import {
  chatSettingsTable,
  jobEventsTable,
  jobsTable,
  projectsTable,
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
    const row = {
      id: job.id,
      chatId: String(job.chatId),
      threadId: job.threadId || null,
      request: String(job.request),
      projectName: String(job.projectName),
      workdir: String(job.workdir),
      status: String(job.status),
      createdAt: job.createdAt || nowIso(),
      queuedAt: job.queuedAt || null,
      pendingApprovalAt: job.pendingApprovalAt || null,
      approvedAt: job.approvedAt || null,
      startedAt: job.startedAt || null,
      completedAt: job.completedAt || null,
      deniedAt: job.deniedAt || null,
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
    if ("summary" in patch) update.summary = patch.summary || null;
    if ("error" in patch) update.error = patch.error || null;
    if ("projectName" in patch) update.projectName = patch.projectName || null;
    if ("workdir" in patch) update.workdir = patch.workdir || null;
    if ("request" in patch) update.request = patch.request || null;

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
      .where(eq(threadsTable.projectName, String(projectName)))
      .orderBy(desc(threadsTable.updatedAt))
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

  createThread({ id, projectName, title }) {
    const now = nowIso();
    const row = {
      id: String(id),
      projectName: String(projectName),
      title: String(title),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(threadsTable).values(row).run();
    return this.getThread(id);
  }

  updateThread(threadId, patch) {
    if (!threadId) return null;
    const update = { updatedAt: nowIso() };
    if ("title" in patch) update.title = patch.title;
    if ("status" in patch) update.status = patch.status;
    this.db
      .update(threadsTable)
      .set(update)
      .where(eq(threadsTable.id, String(threadId)))
      .run();
    return this.getThread(threadId);
  }

  listJobsByThread(threadId, limit = 100) {
    if (!threadId) return [];
    return this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.threadId, String(threadId)))
      .orderBy(asc(jobsTable.createdAt))
      .limit(limit)
      .all();
  }

  deleteThread(threadId) {
    if (!threadId) return;
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
}

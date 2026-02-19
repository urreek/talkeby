import { resolveExecutionMode } from "./command-parser.mjs";

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTimestamp(value) {
  return value ? String(value) : "";
}

function safeList(items) {
  if (!items || items.length === 0) {
    return "(none)";
  }
  return items.join(", ");
}

export class RuntimeState {
  constructor({ config, repository }) {
    this.config = config;
    this.repository = repository;

    this.jobHistory = new Map();
    this.lastJobByChat = new Map();
    this.lastPendingJobByChat = new Map();
    this.projectNameByChat = new Map();
    this.executionModeByChat = new Map();
  }

  hydrate() {
    const chatSettings = this.repository.listChatSettings();
    for (const row of chatSettings) {
      if (row.projectName) {
        this.projectNameByChat.set(String(row.chatId), String(row.projectName));
      }
      this.executionModeByChat.set(
        String(row.chatId),
        resolveExecutionMode(row.executionMode) || this.config.telegram.defaultExecutionMode,
      );
    }

    const jobs = this.repository.listRecentJobs(500).reverse();
    for (const job of jobs) {
      this.jobHistory.set(job.id, job);
      this.lastJobByChat.set(String(job.chatId), job.id);
      if (job.status === "pending_approval") {
        this.lastPendingJobByChat.set(String(job.chatId), job.id);
      }
    }
  }

  safeAllowedChats() {
    return safeList(Array.from(this.config.telegram.allowedChatIds));
  }

  availableProjectNames() {
    return Array.from(this.config.codex.projects.keys());
  }

  resolveProjectName(inputName) {
    const requested = textValue(inputName);
    if (!requested) {
      return "";
    }

    for (const name of this.config.codex.projects.keys()) {
      if (name.toLowerCase() === requested.toLowerCase()) {
        return name;
      }
    }
    return "";
  }

  getProjectNameForChat(chatId) {
    const selected = this.projectNameByChat.get(String(chatId)) || "";
    return this.resolveProjectName(selected) || this.config.codex.defaultProjectName;
  }

  getProjectForChat(chatId) {
    const name = this.getProjectNameForChat(chatId);
    return {
      name,
      workdir: this.config.codex.projects.get(name),
    };
  }

  setProjectForChat(chatId, projectName) {
    const id = String(chatId);
    this.projectNameByChat.set(id, projectName);
    this.repository.upsertChatSettings({
      chatId: id,
      executionMode: this.getExecutionModeForChat(id),
      projectName,
    });
  }

  getExecutionModeForChat(chatId) {
    const selected = this.executionModeByChat.get(String(chatId)) || "";
    return resolveExecutionMode(selected) || this.config.telegram.defaultExecutionMode;
  }

  setExecutionModeForChat(chatId, mode) {
    const resolved = resolveExecutionMode(mode);
    if (!resolved) {
      return "";
    }
    const id = String(chatId);
    this.executionModeByChat.set(id, resolved);
    this.repository.upsertChatSettings({
      chatId: id,
      executionMode: resolved,
      projectName: this.getProjectNameForChat(id),
    });
    return resolved;
  }

  countQueuedJobs() {
    let queued = 0;
    for (const job of this.jobHistory.values()) {
      if (job.status === "queued") {
        queued += 1;
      }
    }
    return queued;
  }

  listJobs(limit = 100) {
    return this.repository.listRecentJobs(limit);
  }

  getJobById(jobId) {
    if (!jobId) {
      return null;
    }
    const fromMemory = this.jobHistory.get(jobId);
    if (fromMemory) {
      return fromMemory;
    }
    const fromDb = this.repository.getJobById(jobId);
    if (fromDb) {
      this.jobHistory.set(fromDb.id, fromDb);
    }
    return fromDb || null;
  }

  getLatestJobForChat(chatId) {
    const latestJobId = this.lastJobByChat.get(String(chatId));
    return latestJobId ? this.getJobById(latestJobId) : null;
  }

  getLatestPendingJobForChat(chatId) {
    const latestId = this.lastPendingJobByChat.get(String(chatId));
    if (latestId) {
      const latest = this.getJobById(latestId);
      if (latest && latest.chatId === String(chatId) && latest.status === "pending_approval") {
        return latest;
      }
    }

    let pending = null;
    for (const job of this.jobHistory.values()) {
      if (job.chatId === String(chatId) && job.status === "pending_approval") {
        pending = job;
      }
    }
    return pending;
  }

  listPendingJobsForChat(chatId, limit = 10) {
    const chatKey = String(chatId);
    const pending = [];
    for (const job of this.jobHistory.values()) {
      if (job.chatId === chatKey && job.status === "pending_approval") {
        pending.push(job);
      }
    }

    pending.sort((a, b) => {
      const aTime = Date.parse(String(a.createdAt || ""));
      const bTime = Date.parse(String(b.createdAt || ""));
      return bTime - aTime;
    });

    return pending.slice(0, Math.max(1, limit));
  }

  createJob(row) {
    const job = this.repository.insertJob({
      ...row,
      createdAt: row.createdAt || new Date().toISOString(),
      queuedAt: safeTimestamp(row.queuedAt),
      pendingApprovalAt: safeTimestamp(row.pendingApprovalAt),
      approvedAt: safeTimestamp(row.approvedAt),
    });

    this.jobHistory.set(job.id, job);
    this.lastJobByChat.set(String(job.chatId), job.id);
    if (job.status === "pending_approval") {
      this.lastPendingJobByChat.set(String(job.chatId), job.id);
    }
    this.pruneJobHistory();
    return job;
  }

  patchJob(jobId, patch) {
    const updated = this.repository.updateJob(jobId, patch);
    if (!updated) {
      return null;
    }

    this.jobHistory.set(updated.id, updated);
    this.lastJobByChat.set(String(updated.chatId), updated.id);

    const chatId = String(updated.chatId);
    if (updated.status === "pending_approval") {
      this.lastPendingJobByChat.set(chatId, updated.id);
    } else if (this.lastPendingJobByChat.get(chatId) === updated.id) {
      this.lastPendingJobByChat.delete(chatId);
    }
    return updated;
  }

  markPendingConsumed(chatId, jobId) {
    const id = String(chatId);
    if (this.lastPendingJobByChat.get(id) === jobId) {
      this.lastPendingJobByChat.delete(id);
    }
  }

  pruneJobHistory(max = 500) {
    while (this.jobHistory.size > max) {
      const firstKey = this.jobHistory.keys().next().value;
      this.jobHistory.delete(firstKey);
    }
  }
}

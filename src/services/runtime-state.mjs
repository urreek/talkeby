import { resolveExecutionMode } from "./command-parser.mjs";
import { OWNER_SETTING_KEYS, OWNER_SUBJECT_ID } from "./owner-context.mjs";
import { getProviderMeta, isSupportedProvider } from "../providers/catalog.mjs";

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTimestamp(value) {
  return value ? String(value) : "";
}

function isValidProjectName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name);
}

function toStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveModelForProvider(providerName, modelName) {
  const normalizedProvider = String(providerName || "").trim().toLowerCase();
  const normalizedModel = String(modelName || "").trim();
  if (normalizedModel) {
    return normalizedModel;
  }

  return getProviderMeta(normalizedProvider)?.defaultModel || "";
}

export class RuntimeState {
  constructor({ config, repository }) {
    this.config = config;
    this.repository = repository;
    this.ownerId = OWNER_SUBJECT_ID;

    this.jobHistory = new Map();
    this.latestJobId = "";
    this.latestPendingJobId = "";
    this.activeProjectName = "";
    this.executionMode = config.app?.defaultExecutionMode || "auto";
    this.provider = config.runner?.provider || "codex";
    this.model = resolveModelForProvider(this.provider, config.runner?.model || "");
    this.reasoningEffort = "medium";
    this.planMode = false;
    this.runtimeApprovalWaiters = new Map();
    this.startupRecovery = {
      failedJobs: [],
      queuedJobs: [],
    };
  }

  hydrate() {
    this.repository.denyPendingRuntimeApprovals();
    this.hydrateProjects();
    this.reconcileStartupJobs();
    this.hydrateOwnerSettings();
    this.hydrateJobs();
  }

  hydrateProjects() {
    const persistedProjects = this.repository.listProjects();
    for (const row of persistedProjects) {
      const name = textValue(row.name);
      const projectPath = textValue(row.path);
      if (!name || !projectPath) {
        continue;
      }
      if (this.resolveProjectName(name)) {
        continue;
      }
      this.config.codex.projects.set(name, projectPath);
    }
  }

  reconcileStartupJobs() {
    const recoveryTime = new Date().toISOString();
    const jobs = this.repository.listRecentJobs(5000).reverse();

    for (const job of jobs) {
      const status = toStatus(job.status);
      if (status === "running") {
        const updated = this.repository.updateJob(job.id, {
          status: "failed",
          completedAt: recoveryTime,
          error: "Talkeby restarted while this job was running.",
        });
        if (updated) {
          this.startupRecovery.failedJobs.push(updated);
        }
      }
    }
  }

  hydrateOwnerSettings() {
    const activeProjectSetting = this.repository.getAppSetting(OWNER_SETTING_KEYS.activeProject);
    const storedProjectName = textValue(activeProjectSetting?.value || "");
    this.activeProjectName = this.resolveProjectName(storedProjectName)
      || this.config.codex.defaultProjectName
      || "";

    const executionModeSetting = this.repository.getAppSetting(OWNER_SETTING_KEYS.executionMode);
    this.executionMode = resolveExecutionMode(executionModeSetting?.value || "")
      || this.config.app?.defaultExecutionMode
      || "auto";
  }

  hydrateJobs() {
    const jobs = this.repository.listRecentJobs(5000).reverse();
    for (const job of jobs) {
      this.jobHistory.set(job.id, job);
      this.latestJobId = job.id;
      if (job.status === "pending_approval") {
        this.latestPendingJobId = job.id;
      }
      if (job.status === "queued") {
        this.startupRecovery.queuedJobs.push(job);
      }
    }
  }

  consumeStartupRecovery() {
    const snapshot = {
      failedJobs: [...this.startupRecovery.failedJobs],
      queuedJobs: [...this.startupRecovery.queuedJobs],
    };
    this.startupRecovery = {
      failedJobs: [],
      queuedJobs: [],
    };
    return snapshot;
  }

  getOwnerId() {
    return this.ownerId;
  }

  getProvider() {
    return this.provider;
  }

  setProvider(providerName) {
    const normalized = String(providerName || "").trim().toLowerCase();
    if (!isSupportedProvider(normalized)) {
      return "";
    }
    this.provider = normalized;
    return normalized;
  }

  getModel() {
    return resolveModelForProvider(this.provider, this.model);
  }

  setModel(modelName) {
    this.model = resolveModelForProvider(this.provider, modelName);
    return this.model;
  }

  getReasoningEffort() {
    return this.reasoningEffort;
  }

  setReasoningEffort(effort) {
    const normalized = String(effort || "").trim().toLowerCase();
    if (!normalized) {
      this.reasoningEffort = "medium";
      return this.reasoningEffort;
    }

    this.reasoningEffort = normalized;
    return normalized;
  }

  getPlanMode() {
    return this.planMode;
  }

  setPlanMode(enabled) {
    this.planMode = Boolean(enabled);
    return this.planMode;
  }

  availableProjectNames() {
    return this.listProjects().map((project) => project.name);
  }

  listProjects() {
    return Array.from(this.config.codex.projects.entries())
      .map(([name, projectPath]) => ({
        name,
        path: String(projectPath),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  normalizeProjectName(inputName) {
    const requested = textValue(inputName);
    if (!requested || !isValidProjectName(requested)) {
      return "";
    }
    return requested;
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

  getProjectName() {
    const resolved = this.resolveProjectName(this.activeProjectName);
    if (resolved) {
      return resolved;
    }
    return this.config.codex.defaultProjectName || "";
  }

  getProject() {
    const name = this.getProjectName();
    if (!name) {
      return { name: "", workdir: "" };
    }
    return {
      name,
      workdir: this.config.codex.projects.get(name) || "",
    };
  }

  setProject(projectName) {
    const resolved = this.resolveProjectName(projectName);
    if (!resolved) {
      return "";
    }
    this.activeProjectName = resolved;
    this.repository.setAppSetting({
      key: OWNER_SETTING_KEYS.activeProject,
      value: resolved,
    });
    return resolved;
  }

  addProject({ projectName, projectPath }) {
    const normalizedName = this.normalizeProjectName(projectName);
    const normalizedPath = textValue(projectPath);

    if (!normalizedName) {
      return {
        error: "Invalid project name. Use letters, numbers, dots, underscores, or dashes.",
      };
    }
    if (!normalizedPath) {
      return { error: "Project path is required." };
    }
    if (this.resolveProjectName(normalizedName)) {
      return { error: `Project ${normalizedName} already exists.` };
    }

    this.config.codex.projects.set(normalizedName, normalizedPath);
    this.repository.upsertProject({
      name: normalizedName,
      path: normalizedPath,
      createdByChatId: this.ownerId,
    });

    return {
      project: {
        name: normalizedName,
        path: normalizedPath,
      },
    };
  }

  removeProject(projectName) {
    const resolvedName = this.resolveProjectName(projectName);
    if (!resolvedName) {
      return { error: "Project was not found." };
    }

    this.config.codex.projects.delete(resolvedName);
    this.repository.deleteProject(resolvedName);

    if (!this.resolveProjectName(this.activeProjectName)) {
      this.activeProjectName = this.config.codex.defaultProjectName || "";
      this.repository.setAppSetting({
        key: OWNER_SETTING_KEYS.activeProject,
        value: this.activeProjectName,
      });
    }

    return { ok: true };
  }

  getExecutionMode() {
    return resolveExecutionMode(this.executionMode) || this.config.app?.defaultExecutionMode || "auto";
  }

  setExecutionMode(mode) {
    const resolved = resolveExecutionMode(mode);
    if (!resolved) {
      return "";
    }
    this.executionMode = resolved;
    this.repository.setAppSetting({
      key: OWNER_SETTING_KEYS.executionMode,
      value: resolved,
    });
    return resolved;
  }

  countQueuedJobs(threadId = "") {
    const normalizedThreadId = String(threadId || "").trim();
    let queued = 0;
    for (const job of this.jobHistory.values()) {
      if (job.status !== "queued") {
        continue;
      }
      if (normalizedThreadId && String(job.threadId || "") !== normalizedThreadId) {
        continue;
      }
      queued += 1;
    }
    return queued;
  }

  listJobs(limit = 100) {
    return this.repository.listRecentJobs(limit);
  }

  listQueuedJobs(limit = 5000) {
    return this.repository
      .listRecentJobs(limit)
      .filter((job) => job.status === "queued")
      .reverse();
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

  getLatestJob() {
    return this.latestJobId ? this.getJobById(this.latestJobId) : null;
  }

  getLatestPendingJob() {
    if (this.latestPendingJobId) {
      const latest = this.getJobById(this.latestPendingJobId);
      if (latest && latest.status === "pending_approval") {
        return latest;
      }
    }

    let pending = null;
    for (const job of this.jobHistory.values()) {
      if (job.status === "pending_approval") {
        pending = job;
      }
    }
    return pending;
  }

  listPendingJobs(limit = 10) {
    const pending = [];
    for (const job of this.jobHistory.values()) {
      if (job.status === "pending_approval") {
        pending.push(job);
      }
    }

    pending.sort((left, right) => {
      const leftTime = Date.parse(String(left.createdAt || ""));
      const rightTime = Date.parse(String(right.createdAt || ""));
      return rightTime - leftTime;
    });

    return pending.slice(0, Math.max(1, limit));
  }

  createJob(row) {
    const job = this.repository.insertJob({
      ...row,
      chatId: row.chatId || this.ownerId,
      provider: row.provider || this.getProvider(),
      createdAt: row.createdAt || new Date().toISOString(),
      queuedAt: safeTimestamp(row.queuedAt),
      pendingApprovalAt: safeTimestamp(row.pendingApprovalAt),
      approvedAt: safeTimestamp(row.approvedAt),
    });

    this.jobHistory.set(job.id, job);
    this.latestJobId = job.id;
    if (job.status === "pending_approval") {
      this.latestPendingJobId = job.id;
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
    this.latestJobId = updated.id;
    if (updated.status === "pending_approval") {
      this.latestPendingJobId = updated.id;
    } else if (this.latestPendingJobId === updated.id) {
      this.latestPendingJobId = "";
    }
    return updated;
  }

  claimJobForExecution({ jobId, leaseId, startedAt }) {
    const claimed = this.repository.claimJobForExecution({
      jobId,
      leaseId,
      startedAt,
    });
    if (!claimed) {
      return null;
    }

    this.jobHistory.set(claimed.id, claimed);
    this.latestJobId = claimed.id;
    return claimed;
  }

  createRuntimeApproval(input) {
    return this.repository.insertRuntimeApproval({
      ...input,
      chatId: input.chatId || this.ownerId,
    });
  }

  listRuntimeApprovals({ jobId = "", status = "", limit = 50 } = {}) {
    return this.repository.listRuntimeApprovals({
      jobId,
      status,
      limit,
    });
  }

  getRuntimeApprovalById(id) {
    return this.repository.getRuntimeApprovalById(id);
  }

  resolveRuntimeApproval({ id, status, resolvedByChatId = "" }) {
    return this.repository.resolveRuntimeApproval({
      id,
      status,
      resolvedByChatId: resolvedByChatId || this.ownerId,
    });
  }

  waitForRuntimeApprovalDecision(id) {
    const existingRecord = this.getRuntimeApprovalById(id);
    if (existingRecord && existingRecord.status !== "pending") {
      return Promise.resolve(existingRecord.status === "approved" ? "approve" : "deny");
    }

    const existing = this.runtimeApprovalWaiters.get(String(id));
    if (existing) {
      return existing.promise;
    }

    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    this.runtimeApprovalWaiters.set(String(id), {
      promise,
      resolve: resolvePromise,
    });
    return promise;
  }

  resolveRuntimeApprovalDecision({ id, decision }) {
    const waiter = this.runtimeApprovalWaiters.get(String(id));
    if (!waiter) {
      return;
    }
    this.runtimeApprovalWaiters.delete(String(id));
    waiter.resolve(decision === "approve" ? "approve" : "deny");
  }

  markPendingConsumed(jobId) {
    if (this.latestPendingJobId === jobId) {
      this.latestPendingJobId = "";
    }
  }

  pruneJobHistory(max = 500) {
    while (this.jobHistory.size > max) {
      const firstKey = this.jobHistory.keys().next().value;
      this.jobHistory.delete(firstKey);
    }
  }
}


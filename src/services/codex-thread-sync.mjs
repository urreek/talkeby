import {
  archiveCodexAppThread,
  denormalizeCodexAppWorkdir,
  findLatestCodexAppThreadTemplate,
  getCodexAppThreadById,
  listCodexAppThreads,
  removeCodexSessionIndexEntry,
  upsertCodexAppThread,
  upsertCodexSessionIndexEntry,
} from "./codex-app-registry.mjs";
import {
  inspectCodexSession,
  readCodexSessionFile,
  validateCodexSession,
} from "./codex-sessions.mjs";

function textValue(value) {
  return String(value || "").trim();
}

function normalizePath(value) {
  const raw = denormalizeCodexAppWorkdir(value);
  return process.platform === "win32"
    ? raw.replace(/\//g, "\\").toLowerCase()
    : raw;
}

function toIsoFromUnixSeconds(value) {
  const seconds = Number.parseInt(String(value || 0), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date().toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}

function toUnixSeconds(value, fallbackMs = Date.now()) {
  const raw = String(value || "").trim();
  if (!raw) {
    return Math.floor(fallbackMs / 1000);
  }
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(fallbackMs / 1000);
}

function buildFallbackSandboxPolicy(workdir) {
  return JSON.stringify({
    type: "workspace-write",
    writable_roots: [textValue(workdir)],
    network_access: false,
    exclude_tmpdir_env_var: false,
    exclude_slash_tmp: false,
  });
}

function resolveProjectNameForWorkdir(config, workdir) {
  const normalizedWorkdir = normalizePath(workdir);
  if (!normalizedWorkdir) {
    return "";
  }

  let bestProjectName = "";
  let bestLength = -1;
  for (const [projectName, projectPath] of config.codex.projects.entries()) {
    const normalizedProjectPath = normalizePath(projectPath);
    if (!normalizedProjectPath) {
      continue;
    }
    const isMatch = normalizedWorkdir === normalizedProjectPath
      || normalizedWorkdir.startsWith(`${normalizedProjectPath}${process.platform === "win32" ? "\\" : "/"}`);
    if (!isMatch || normalizedProjectPath.length <= bestLength) {
      continue;
    }
    bestProjectName = projectName;
    bestLength = normalizedProjectPath.length;
  }
  return bestProjectName;
}

function parseGitMeta(meta = {}) {
  const git = meta?.git || {};
  return {
    sha: textValue(git.commit_hash || git.sha || ""),
    branch: textValue(git.branch || ""),
    originUrl: textValue(git.repository_url || git.origin_url || git.originUrl || ""),
  };
}

function talkebyThreadWorkdir(config, thread) {
  const projectName = textValue(thread?.projectName);
  return projectName ? textValue(config.codex.projects.get(projectName)) : "";
}

function getFirstTalkebyUserMessage(repository, threadId, fallback = "") {
  const jobs = repository.listJobsByThread(threadId, 1);
  return textValue(jobs[0]?.request || fallback);
}

export class CodexThreadSync {
  constructor({
    config,
    repository,
    codexHomeDir = "",
    log = console,
    throttleMs = 5000,
  }) {
    this.config = config;
    this.repository = repository;
    this.codexHomeDir = codexHomeDir;
    this.log = log;
    this.throttleMs = Math.max(0, Number(throttleMs) || 0);
    this.lastSyncAtMs = 0;
    this.syncPromise = null;
  }

  async ensureSynced({ force = false } = {}) {
    if (!force && this.syncPromise) {
      return this.syncPromise;
    }
    if (!force && Date.now() - this.lastSyncAtMs < this.throttleMs) {
      return;
    }

    this.syncPromise = this.runSync()
      .catch((error) => {
        this.log?.warn?.({ err: error }, "Codex thread sync failed.");
      })
      .finally(() => {
        this.lastSyncAtMs = Date.now();
        this.syncPromise = null;
      });

    return this.syncPromise;
  }

  async syncTalkebyThread(threadId) {
    const thread = this.repository.getThread(threadId);
    if (!thread) {
      return;
    }
    await this.exportTalkebyThread(thread);
  }

  async archiveTalkebyThread(thread) {
    const sessionId = textValue(thread?.cliSessionId);
    if (!sessionId) {
      return;
    }
    archiveCodexAppThread({
      codexHomeDir: this.codexHomeDir,
      sessionId,
    });
    removeCodexSessionIndexEntry({
      codexHomeDir: this.codexHomeDir,
      sessionId,
    });
  }

  async runSync() {
    await this.importCodexAppThreads();
    await this.exportTalkebyThreads();
  }

  async importCodexAppThreads() {
    const appThreads = listCodexAppThreads({
      codexHomeDir: this.codexHomeDir,
      includeArchived: true,
      limit: 5000,
    });

    for (const appThread of appThreads) {
      const workdir = denormalizeCodexAppWorkdir(appThread.cwd);
      const projectName = resolveProjectNameForWorkdir(this.config, workdir);
      if (!projectName) {
        continue;
      }

      const existing = this.repository.getThreadByCliSessionId(appThread.id);
      if (Number(appThread.archived || 0)) {
        if (existing && String(existing.status || "").toLowerCase() !== "archived") {
          this.repository.updateThread(existing.id, {
            status: "archived",
            cliSessionId: appThread.id,
          });
        }
        continue;
      }

      const validation = await validateCodexSession({
        sessionId: appThread.id,
        workdir,
        minTaskMessages: 0,
      });
      if (!validation.ok) {
        continue;
      }

      const title = textValue(appThread.title || appThread.first_user_message || "Conversation");
      if (!existing) {
        this.repository.createThread({
          id: appThread.id,
          projectName,
          title,
          status: "active",
          cliSessionId: appThread.id,
          tokenBudget: this.config.threads?.defaultTokenBudget ?? 12000,
          autoTrimContext: this.config.threads?.autoTrimContextDefault !== false,
          createdAt: toIsoFromUnixSeconds(appThread.created_at),
          updatedAt: toIsoFromUnixSeconds(appThread.updated_at),
        });
        continue;
      }

      const talkebyUpdatedAt = Date.parse(String(existing.updatedAt || "")) || 0;
      const appUpdatedAt = Number(appThread.updated_at || 0) * 1000;
      if (appUpdatedAt > talkebyUpdatedAt && title && title !== existing.title) {
        this.repository.updateThread(existing.id, {
          status: "active",
          title,
          cliSessionId: appThread.id,
        });
      }
    }
  }

  async exportTalkebyThreads() {
    const threads = this.repository.listRecentThreads(5000)
      .filter((thread) => textValue(thread.cliSessionId));

    for (const thread of threads) {
      await this.exportTalkebyThread(thread);
    }
  }

  async exportTalkebyThread(thread) {
    const sessionId = textValue(thread?.cliSessionId);
    if (!sessionId) {
      return;
    }

    const workdir = talkebyThreadWorkdir(this.config, thread);
    if (!workdir) {
      return;
    }

    const session = await inspectCodexSession({
      sessionId,
      workdir,
    });
    if (!session?.filePath) {
      return;
    }

    const parsed = await readCodexSessionFile(session.filePath);
    const meta = parsed.meta || {};
    const gitMeta = parseGitMeta(meta);
    const appThread = getCodexAppThreadById({
      codexHomeDir: this.codexHomeDir,
      sessionId,
    });
    const template = appThread || findLatestCodexAppThreadTemplate({
      codexHomeDir: this.codexHomeDir,
      workdir: session.workdir,
    }) || null;
    const firstUserMessage = getFirstTalkebyUserMessage(
      this.repository,
      thread.id,
      thread.title,
    );
    const talkebyUpdatedAtMs = Date.parse(String(thread.updatedAt || "")) || session.mtimeMs || Date.now();
    const appUpdatedAtMs = Number(appThread?.updated_at || 0) * 1000;
    if (appThread && appUpdatedAtMs > talkebyUpdatedAtMs) {
      return;
    }

    const nextThread = upsertCodexAppThread({
      codexHomeDir: this.codexHomeDir,
      thread: {
        id: sessionId,
        rollout_path: session.filePath,
        created_at: appThread?.created_at || toUnixSeconds(thread.createdAt, session.mtimeMs),
        updated_at: toUnixSeconds(thread.updatedAt, session.mtimeMs),
        source: textValue(template?.source || "vscode"),
        model_provider: textValue(meta.model_provider || template?.model_provider || "openai"),
        cwd: session.workdir,
        title: textValue(thread.title || template?.title || firstUserMessage || "Conversation"),
        sandbox_policy: textValue(template?.sandbox_policy || buildFallbackSandboxPolicy(session.workdir)),
        approval_mode: textValue(template?.approval_mode || "on-request"),
        tokens_used: Math.max(
          Number.parseInt(String(thread.tokenUsed || 0), 10) || 0,
          Number.parseInt(String(appThread?.tokens_used || 0), 10) || 0,
        ),
        has_user_event: Number(appThread?.has_user_event || 0),
        archived: 0,
        archived_at: null,
        git_sha: gitMeta.sha || appThread?.git_sha || null,
        git_branch: gitMeta.branch || appThread?.git_branch || null,
        git_origin_url: gitMeta.originUrl || appThread?.git_origin_url || null,
        cli_version: textValue(meta.cli_version || appThread?.cli_version || ""),
        first_user_message: firstUserMessage,
        agent_nickname: appThread?.agent_nickname || null,
        agent_role: appThread?.agent_role || null,
        memory_mode: textValue(appThread?.memory_mode || "enabled"),
      },
    });

    upsertCodexSessionIndexEntry({
      codexHomeDir: this.codexHomeDir,
      sessionId,
      title: nextThread?.title || thread.title,
      updatedAt: nextThread?.updated_at || thread.updatedAt,
    });
  }
}

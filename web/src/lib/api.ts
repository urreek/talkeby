import type {
  AgentProfileResponse,
  AccessStatusResponse,
  DoctorResponse,
  ExecutionMode,
  Job,
  JobContextResponse,
  JobEvent,
  ImportProjectsResponse,
  ModeResponse,
  ObservabilitySummary,
  ProviderCatalogResponse,
  ProjectsResponse,
  ProviderResponse,
  RuntimeApprovalsResponse,
  Thread,
  ThreadsResponse,
} from "@/lib/types";
import { getStoredAccessKey, getStoredChatId } from "@/lib/storage";

type CsrfTokenRecord = {
  token: string;
  expiresAt: string;
};

const csrfByChat = new Map<string, CsrfTokenRecord>();
const csrfUnsupportedChats = new Set<string>();
let ownerDefaultChatId = "";
let ownerDefaultChatIdLoaded = false;

function applyAccessKeyHeader(headers: Record<string, string>) {
  const accessKey = getStoredAccessKey();
  if (accessKey) {
    headers["x-talkeby-key"] = accessKey;
    headers["x-app-key"] = accessKey;
    headers.authorization = `Bearer ${accessKey}`;
  }
}

function isMutatingMethod(method: string) {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}

function parseJsonBodyChatId(body: BodyInit | null | undefined): string {
  if (!body || typeof body !== "string") {
    return "";
  }
  try {
    const parsed = JSON.parse(body) as { chatId?: unknown };
    return typeof parsed.chatId === "string" ? parsed.chatId.trim() : "";
  } catch {
    return "";
  }
}

function parseJsonObjectBody(body: BodyInit | null | undefined): Record<string, unknown> | null {
  if (!body || typeof body !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseQueryChatId(path: string): string {
  const queryIndex = path.indexOf("?");
  if (queryIndex < 0) {
    return "";
  }
  const params = new URLSearchParams(path.slice(queryIndex + 1));
  return params.get("chatId")?.trim() || "";
}

async function fetchCsrfToken(chatId: string): Promise<CsrfTokenRecord | null> {
  const headers: Record<string, string> = {};
  applyAccessKeyHeader(headers);
  const response = await fetch(`/api/security/csrf?chatId=${encodeURIComponent(chatId)}`, {
    method: "GET",
    headers,
  });
  if (response.status === 404) {
    csrfUnsupportedChats.add(chatId);
    return null;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.token !== "string") {
    const message = typeof body?.error === "string"
      ? body.error
      : `GET /api/security/csrf failed (${response.status})`;
    throw new Error(message);
  }
  const tokenRecord = {
    token: body.token,
    expiresAt: String(body.expiresAt || ""),
  };
  csrfByChat.set(chatId, tokenRecord);
  return tokenRecord;
}

async function ensureCsrfToken(chatId: string): Promise<string> {
  if (csrfUnsupportedChats.has(chatId)) {
    return "";
  }

  const existing = csrfByChat.get(chatId);
  if (existing?.token) {
    const expiresAt = Date.parse(existing.expiresAt || "");
    if (!Number.isNaN(expiresAt) && expiresAt - Date.now() > 20_000) {
      return existing.token;
    }
  }
  const refreshed = await fetchCsrfToken(chatId);
  return refreshed?.token || "";
}

async function resolveOwnerDefaultChatId(): Promise<string> {
  if (ownerDefaultChatIdLoaded) {
    return ownerDefaultChatId;
  }

  const headers: Record<string, string> = {};
  applyAccessKeyHeader(headers);

  try {
    const response = await fetch("/api/security/access", {
      method: "GET",
      headers,
    });
    const body = await response.json().catch(() => ({}));
    if (
      response.ok
      && typeof body?.authenticated === "boolean"
      && body.authenticated
      && typeof body?.ownerChatId === "string"
      && body.ownerChatId.trim()
    ) {
      ownerDefaultChatId = body.ownerChatId.trim();
    }
  } catch {
    // Non-fatal fallback.
  } finally {
    ownerDefaultChatIdLoaded = true;
  }

  return ownerDefaultChatId;
}

async function resolveEffectiveChatId(preferred = ""): Promise<string> {
  const direct = String(preferred || "").trim();
  if (direct) {
    return direct;
  }
  const stored = getStoredChatId();
  if (stored) {
    return stored;
  }
  return resolveOwnerDefaultChatId();
}

async function resolveChatId(path: string, init?: RequestInit): Promise<string> {
  const fromBody = parseJsonBodyChatId(init?.body);
  if (fromBody) {
    return fromBody;
  }
  const fromQuery = parseQueryChatId(path);
  if (fromQuery) {
    return fromQuery;
  }
  const stored = getStoredChatId();
  if (stored) {
    return stored;
  }
  return resolveOwnerDefaultChatId();
}

function appendChatIdToPath(path: string, chatId: string): string {
  if (!chatId || parseQueryChatId(path)) {
    return path;
  }
  const delimiter = path.includes("?") ? "&" : "?";
  return `${path}${delimiter}chatId=${encodeURIComponent(chatId)}`;
}

function injectChatIdIntoInit(path: string, init: RequestInit | undefined, chatId: string) {
  if (!chatId) {
    return {
      path,
      init,
    };
  }

  const existingBodyChatId = parseJsonBodyChatId(init?.body);
  if (existingBodyChatId) {
    return {
      path,
      init,
    };
  }
  if (parseQueryChatId(path)) {
    return {
      path,
      init,
    };
  }

  const parsedBody = parseJsonObjectBody(init?.body);
  if (parsedBody) {
    const merged = {
      ...parsedBody,
      chatId,
    };
    return {
      path,
      init: {
        ...init,
        body: JSON.stringify(merged),
      },
    };
  }

  if (init?.body) {
    return {
      path: appendChatIdToPath(path, chatId),
      init,
    };
  }

  return {
    path: appendChatIdToPath(path, chatId),
    init,
  };
}

async function requestJson<T>(path: string, init?: RequestInit, allowRetry = true): Promise<T> {
  const method = init?.method || "GET";
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> ?? {}),
  };
  applyAccessKeyHeader(headers);
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  const mutating = isMutatingMethod(method);
  const chatId = mutating ? await resolveChatId(path, init) : "";
  const withChat = mutating ? injectChatIdIntoInit(path, init, chatId) : { path, init };
  path = withChat.path;
  init = withChat.init;
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  if (mutating) {
    if (!chatId) {
      throw new Error("chatId is required for mutating API requests.");
    }
    const csrfToken = await ensureCsrfToken(chatId);
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const body = await response.json().catch(() => ({}));
  if (
    mutating
    && allowRetry
    && response.status === 403
    && typeof body?.code === "string"
    && body.code === "csrf_invalid"
  ) {
    if (chatId) {
      csrfByChat.delete(chatId);
      return requestJson<T>(path, init, false);
    }
  }

  if (!response.ok) {
    const message = typeof body?.error === "string"
      ? body.error
      : `${method} ${path} failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

export async function fetchAccessStatus(): Promise<AccessStatusResponse> {
  const headers: Record<string, string> = {};
  applyAccessKeyHeader(headers);

  const response = await fetch("/api/security/access", {
    method: "GET",
    headers,
  });
  if (response.status === 404) {
    return {
      required: false,
      authenticated: true,
    };
  }

  const body = await response.json().catch(() => ({}));
  if (
    !response.ok
    || typeof body?.required !== "boolean"
    || typeof body?.authenticated !== "boolean"
  ) {
    const message = typeof body?.error === "string"
      ? body.error
      : `GET /api/security/access failed (${response.status})`;
    throw new Error(message);
  }

  return {
    required: body.required,
    authenticated: body.authenticated,
    ownerChatId: typeof body?.ownerChatId === "string" ? body.ownerChatId : null,
  };
}

export async function fetchAgentProfile(chatId = ""): Promise<AgentProfileResponse> {
  const effectiveChatId = await resolveEffectiveChatId(chatId);
  if (!effectiveChatId) {
    throw new Error("chatId is required. Set OWNER_CHAT_ID or save chat ID in Settings.");
  }
  return requestJson<AgentProfileResponse>(`/api/agent-profile?chatId=${encodeURIComponent(effectiveChatId)}`);
}

export async function setAgentProfile(input: { chatId: string; profile: string }) {
  return requestJson<{ ok: true; profile: string }>("/api/agent-profile", {
    method: "POST",
    body: JSON.stringify({
      chatId: input.chatId,
      profile: input.profile,
    }),
  });
}

export async function fetchJobs(params: {
  chatId?: string;
  status?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.chatId) searchParams.set("chatId", params.chatId);
  if (params.status) searchParams.set("status", params.status);
  if (params.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  return requestJson<Job[]>(`/api/jobs${query ? `?${query}` : ""}`);
}

export async function fetchJob(id: string, chatId: string) {
  return requestJson<Job>(`/api/jobs/${encodeURIComponent(id)}?chatId=${encodeURIComponent(chatId)}`);
}

export async function fetchJobEvents(jobId: string, chatId: string, limit = 250) {
  return requestJson<JobEvent[]>(
    `/api/jobs/${encodeURIComponent(jobId)}/events?chatId=${encodeURIComponent(chatId)}&limit=${limit}`
  );
}

export async function fetchJobContext(jobId: string, chatId: string) {
  return requestJson<JobContextResponse>(
    `/api/jobs/${encodeURIComponent(jobId)}/context?chatId=${encodeURIComponent(chatId)}`
  );
}

export async function createJob(input: {
  chatId: string;
  task: string;
  projectName?: string;
  threadId?: string;
}) {
  return requestJson<{
    ok: true;
    jobId: string;
    status: string;
    queuePosition: number | null;
    executionMode: ExecutionMode;
    projectName: string;
  }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function approveJob(input: { chatId: string; jobId: string }) {
  return requestJson<{ ok: true; jobId: string; status: string; queuePosition: number }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ chatId: input.chatId })
    }
  );
}

export async function denyJob(input: { chatId: string; jobId: string }) {
  return requestJson<{ ok: true; jobId: string; status: string }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/deny`,
    {
      method: "POST",
      body: JSON.stringify({ chatId: input.chatId })
    }
  );
}

export async function retryJob(input: { chatId: string; jobId: string }) {
  return requestJson<{
    ok: true;
    jobId: string;
    status: string;
    executionMode: ExecutionMode;
    queuePosition: number | null;
    projectName: string;
  }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/retry`,
    {
      method: "POST",
      body: JSON.stringify({ chatId: input.chatId }),
    }
  );
}

export async function resumeJobFromError(input: { chatId: string; jobId: string }) {
  return requestJson<{
    ok: true;
    jobId: string;
    status: string;
    executionMode: ExecutionMode;
    queuePosition: number | null;
    projectName: string;
  }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/resume-error`,
    {
      method: "POST",
      body: JSON.stringify({ chatId: input.chatId }),
    },
  );
}

export async function stopJob(input: { chatId: string; jobId: string }) {
  return requestJson<{ ok: true; jobId: string; status: string }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/stop`,
    {
      method: "POST",
      body: JSON.stringify({ chatId: input.chatId }),
    },
  );
}

export async function fetchMode(chatId: string) {
  const effectiveChatId = await resolveEffectiveChatId(chatId);
  if (!effectiveChatId) {
    return requestJson<ModeResponse>("/api/mode");
  }
  return requestJson<ModeResponse>(`/api/mode?chatId=${encodeURIComponent(effectiveChatId)}`);
}

export async function setMode(input: { chatId: string; mode: ExecutionMode }) {
  return requestJson<{ chatId: string; executionMode: ExecutionMode }>("/api/mode", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchProjects(chatId?: string) {
  const effectiveChatId = await resolveEffectiveChatId(chatId || "");
  if (!effectiveChatId) {
    throw new Error("chatId is required. Set OWNER_CHAT_ID or save chat ID in Settings.");
  }
  return requestJson<ProjectsResponse>(`/api/projects?chatId=${encodeURIComponent(effectiveChatId)}`);
}

export async function selectProject(input: { chatId: string; projectName: string }) {
  return requestJson<{ chatId: string; projectName: string; path: string }>(
    "/api/projects/select",
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export async function fetchProvider() {
  return requestJson<ProviderResponse>("/api/provider");
}

export async function fetchProviderCatalog() {
  return requestJson<ProviderCatalogResponse>("/api/provider/catalog");
}

export async function setProvider(input: { chatId: string; provider?: string; model?: string; reasoningEffort?: string; planMode?: boolean }) {
  return requestJson<ProviderResponse>("/api/provider", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchDoctor() {
  return requestJson<DoctorResponse>("/api/doctor");
}

export async function fetchObservability(chatId: string, days = 7) {
  const effectiveChatId = await resolveEffectiveChatId(chatId);
  if (!effectiveChatId) {
    throw new Error("chatId is required. Set OWNER_CHAT_ID or save chat ID in Settings.");
  }
  return requestJson<ObservabilitySummary>(
    `/api/observability?chatId=${encodeURIComponent(effectiveChatId)}&days=${Math.max(1, Math.min(days, 30))}`,
  );
}

export async function addProject(input: {
  chatId: string;
  projectName: string;
  path?: string;
  setActive?: boolean;
}) {
  const payload: {
    chatId: string;
    projectName: string;
    path?: string;
    setActive?: boolean;
  } = {
    chatId: input.chatId,
    projectName: input.projectName,
  };

  const normalizedPath = input.path?.trim() || "";
  if (normalizedPath) {
    payload.path = normalizedPath;
  }
  if (typeof input.setActive === "boolean") {
    payload.setActive = input.setActive;
  }

  return requestJson<{
    ok: true;
    chatId: string;
    projectName: string;
    path: string;
    basePath: string;
    activeProject: string;
    projects: ProjectsResponse["projects"];
  }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchThreads(projectName: string) {
  return requestJson<ThreadsResponse>(`/api/threads?project=${encodeURIComponent(projectName)}`);
}

export async function createThread(input: { chatId: string; projectName: string; title?: string }) {
  return requestJson<{ thread: Thread }>("/api/threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchThreadJobs(threadId: string) {
  return requestJson<{ jobs: Job[] }>(`/api/threads/${encodeURIComponent(threadId)}/jobs`);
}

export interface DiscoveredProject {
  name: string;
  suggestedProjectName?: string;
  path: string;
  alreadyAdded: boolean;
}

export async function discoverProjects() {
  return requestJson<{ basePath: string; discovered: DiscoveredProject[] }>("/api/projects/discover");
}

export async function importAllDiscoveredProjects(chatId: string) {
  return requestJson<ImportProjectsResponse>("/api/projects/import-all", {
    method: "POST",
    body: JSON.stringify({ chatId }),
  });
}

export async function deleteThread(threadId: string, chatId: string) {
  const effectiveChatId = await resolveEffectiveChatId(chatId);
  if (!effectiveChatId) {
    throw new Error("chatId is required. Set OWNER_CHAT_ID or save chat ID in Settings.");
  }
  return requestJson<{ ok: true }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
    body: JSON.stringify({ chatId: effectiveChatId }),
  });
}

export async function renameThread(threadId: string, chatId: string, title: string) {
  return requestJson<{ thread: Thread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ chatId, title }),
  });
}

export async function setThreadBudget(threadId: string, chatId: string, tokenBudget: number) {
  return requestJson<{ thread: Thread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ chatId, tokenBudget }),
  });
}

export async function setThreadAutoTrimContext(threadId: string, chatId: string, autoTrimContext: boolean) {
  return requestJson<{ thread: Thread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ chatId, autoTrimContext }),
  });
}

export async function deleteProject(name: string, chatId: string) {
  const effectiveChatId = await resolveEffectiveChatId(chatId);
  if (!effectiveChatId) {
    throw new Error("chatId is required. Set OWNER_CHAT_ID or save chat ID in Settings.");
  }
  return requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(name)}`, {
    method: "DELETE",
    body: JSON.stringify({ chatId: effectiveChatId }),
  });
}

export async function fetchRuntimeApprovals(input: {
  chatId: string;
  status?: string;
  jobId?: string;
  limit?: number;
}) {
  const effectiveChatId = await resolveEffectiveChatId(input.chatId);
  if (!effectiveChatId) {
    throw new Error("chatId is required. Set OWNER_CHAT_ID or save chat ID in Settings.");
  }
  const params = new URLSearchParams();
  params.set("chatId", effectiveChatId);
  if (input.status) params.set("status", input.status);
  if (input.jobId) params.set("jobId", input.jobId);
  if (input.limit) params.set("limit", String(input.limit));
  return requestJson<RuntimeApprovalsResponse>(`/api/runtime-approvals?${params.toString()}`);
}

export async function approveRuntimeApproval(input: { id: string; chatId: string }) {
  return requestJson<{ ok: true }>("/api/runtime-approvals/" + encodeURIComponent(input.id) + "/approve", {
    method: "POST",
    body: JSON.stringify({ chatId: input.chatId }),
  });
}

export async function denyRuntimeApproval(input: { id: string; chatId: string }) {
  return requestJson<{ ok: true }>("/api/runtime-approvals/" + encodeURIComponent(input.id) + "/deny", {
    method: "POST",
    body: JSON.stringify({ chatId: input.chatId }),
  });
}

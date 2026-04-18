import type {
  AuthLoginResponse,
  AuthSessionResponse,
  DoctorResponse,
  ExecutionMode,
  ImportProjectsResponse,
  Job,
  JobEvent,
  ObservabilitySummary,
  ProjectsResponse,
  ProviderCatalogResponse,
  ProviderResponse,
  RuntimeApprovalsResponse,
  TerminalSnapshotResponse,
  Thread,
  ThreadMemoryResponse,
  ThreadsResponse,
} from "@/lib/types";

type CsrfTokenRecord = {
  token: string;
  expiresAt: string;
};

type RequestJsonOptions = RequestInit & {
  skipCsrf?: boolean;
};

let csrfTokenRecord: CsrfTokenRecord | null = null;

function isMutatingMethod(method: string) {
  const normalized = method.toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}

async function fetchCsrfToken(): Promise<string> {
  const existing = csrfTokenRecord;
  if (existing?.token) {
    const expiresAt = Date.parse(existing.expiresAt || "");
    if (!Number.isNaN(expiresAt) && expiresAt - Date.now() > 20_000) {
      return existing.token;
    }
  }

  const response = await fetch("/api/security/csrf", {
    method: "GET",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body?.token !== "string") {
    const message = typeof body?.error === "string"
      ? body.error
      : `GET /api/security/csrf failed (${response.status})`;
    throw new Error(message);
  }

  csrfTokenRecord = {
    token: body.token,
    expiresAt: String(body.expiresAt || ""),
  };
  return csrfTokenRecord.token;
}

async function requestJson<T>(path: string, init?: RequestJsonOptions, allowRetry = true): Promise<T> {
  const method = init?.method || "GET";
  const shouldAttachCsrf = isMutatingMethod(method) && !init?.skipCsrf;
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  if (shouldAttachCsrf) {
    const csrfToken = await fetchCsrfToken();
    headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  const body = await response.json().catch(() => ({}));
  if (
    shouldAttachCsrf
    && allowRetry
    && response.status === 403
    && typeof body?.code === "string"
    && body.code === "csrf_invalid"
  ) {
    csrfTokenRecord = null;
    return requestJson<T>(path, init, false);
  }

  if (response.status === 401) {
    csrfTokenRecord = null;
  }

  if (!response.ok) {
    const message = typeof body?.error === "string"
      ? body.error
      : `${method} ${path} failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

export async function fetchSessionStatus(): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/api/auth/session");
}

export async function login(accessKey: string) {
  csrfTokenRecord = null;
  return requestJson<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    skipCsrf: true,
    body: JSON.stringify({ accessKey }),
  });
}

export async function logout() {
  const result = await requestJson<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
  csrfTokenRecord = null;
  return result;
}

export async function fetchJobs(params: {
  status?: string;
  limit?: number;
  threadId?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.threadId) searchParams.set("threadId", params.threadId);

  const query = searchParams.toString();
  return requestJson<Job[]>(`/api/jobs${query ? `?${query}` : ""}`);
}

export async function fetchJob(id: string) {
  return requestJson<Job>(`/api/jobs/${encodeURIComponent(id)}`);
}

export async function fetchJobEvents(jobId: string, limit = 250) {
  return requestJson<JobEvent[]>(
    `/api/jobs/${encodeURIComponent(jobId)}/events?limit=${limit}`,
  );
}

export async function createJob(input: {
  task: string;
  projectName?: string;
  threadId: string;
}) {
  return requestJson<{
    ok: true;
    jobId: string;
    status: string;
    queuePosition: number | null;
    executionMode: ExecutionMode;
    projectName: string;
    threadId: string;
  }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveJob(input: { jobId: string }) {
  return requestJson<{ ok: true; jobId: string; status: string; queuePosition: number }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/approve`,
    {
      method: "POST",
    },
  );
}

export async function denyJob(input: { jobId: string }) {
  return requestJson<{ ok: true; jobId: string; status: string }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/deny`,
    {
      method: "POST",
    },
  );
}

export async function retryJob(input: { jobId: string }) {
  return requestJson<{
    ok: true;
    jobId: string;
    status: string;
    executionMode: ExecutionMode;
    queuePosition: number | null;
    projectName: string;
    threadId: string;
  }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/retry`,
    {
      method: "POST",
    },
  );
}

export async function resumeJobFromError(input: { jobId: string }) {
  return requestJson<{
    ok: true;
    jobId: string;
    status: string;
    executionMode: ExecutionMode;
    queuePosition: number | null;
    projectName: string;
    threadId: string;
  }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/resume-error`,
    {
      method: "POST",
    },
  );
}

export async function stopJob(input: { jobId: string }) {
  return requestJson<{ ok: true; jobId: string; status: string }>(
    `/api/jobs/${encodeURIComponent(input.jobId)}/stop`,
    {
      method: "POST",
    },
  );
}

export async function fetchMode() {
  return requestJson<{ executionMode: ExecutionMode }>("/api/mode");
}

export async function setMode(input: { mode: ExecutionMode }) {
  return requestJson<{ executionMode: ExecutionMode }>("/api/mode", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchProjects() {
  return requestJson<ProjectsResponse>("/api/projects");
}

export async function selectProject(input: { projectName: string }) {
  return requestJson<{ projectName: string; path: string }>(
    "/api/projects/select",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function fetchProvider() {
  return requestJson<ProviderResponse>("/api/provider");
}

export async function fetchProviderCatalog() {
  return requestJson<ProviderCatalogResponse>("/api/provider/catalog");
}

export async function setProvider(input: {
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  planMode?: boolean;
  threadId?: string;
}) {
  return requestJson<ProviderResponse>("/api/provider", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchDoctor() {
  return requestJson<DoctorResponse>("/api/doctor");
}

export async function fetchObservability(days = 7) {
  return requestJson<ObservabilitySummary>(
    `/api/observability?days=${Math.max(1, Math.min(days, 30))}`,
  );
}

export async function addProject(input: {
  projectName: string;
  path?: string;
  setActive?: boolean;
}) {
  const payload: {
    projectName: string;
    path?: string;
    setActive?: boolean;
  } = {
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
    projectName: string;
    path: string;
    basePath: string;
    activeProject: string;
    projects: ProjectsResponse["projects"];
  }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchThreads(projectName: string) {
  return requestJson<ThreadsResponse>(`/api/threads?project=${encodeURIComponent(projectName)}`);
}

export async function createThread(input: { projectName: string; title?: string }) {
  return requestJson<{ thread: Thread }>("/api/threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchThreadJobs(threadId: string) {
  return requestJson<{ jobs: Job[] }>(`/api/threads/${encodeURIComponent(threadId)}/jobs`);
}

export async function fetchThreadMemory(threadId: string) {
  return requestJson<ThreadMemoryResponse>(`/api/threads/${encodeURIComponent(threadId)}/memory`);
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

export async function importAllDiscoveredProjects() {
  return requestJson<ImportProjectsResponse>("/api/projects/import-all", {
    method: "POST",
  });
}

export async function deleteThread(threadId: string) {
  return requestJson<{ ok: true }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export async function renameThread(threadId: string, title: string) {
  return requestJson<{ thread: Thread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteProject(name: string) {
  return requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function fetchRuntimeApprovals(input: {
  status?: string;
  jobId?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.jobId) params.set("jobId", input.jobId);
  if (input.limit) params.set("limit", String(input.limit));

  const query = params.toString();
  return requestJson<RuntimeApprovalsResponse>(`/api/runtime-approvals${query ? `?${query}` : ""}`);
}

export async function approveRuntimeApproval(input: { id: string }) {
  return requestJson<{ ok: true }>(`/api/runtime-approvals/${encodeURIComponent(input.id)}/approve`, {
    method: "POST",
  });
}

export async function denyRuntimeApproval(input: { id: string }) {
  return requestJson<{ ok: true }>(`/api/runtime-approvals/${encodeURIComponent(input.id)}/deny`, {
    method: "POST",
  });
}

export async function fetchTerminalSnapshot(afterEventId = 0, limit = 500) {
  const params = new URLSearchParams();
  if (afterEventId > 0) {
    params.set("afterEventId", String(afterEventId));
  }
  params.set("limit", String(Math.max(1, Math.min(limit, 1000))));

  const query = params.toString();
  return requestJson<TerminalSnapshotResponse>(`/api/terminal${query ? `?${query}` : ""}`);
}

export async function startTerminal(cwd?: string) {
  return requestJson<TerminalSnapshotResponse>("/api/terminal", {
    method: "POST",
    body: JSON.stringify(cwd?.trim() ? { cwd: cwd.trim() } : {}),
  });
}

export async function sendTerminalInput(input: string) {
  return requestJson<{ ok: true }>("/api/terminal/input", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export async function closeTerminal() {
  return requestJson<{ ok: true }>("/api/terminal/close", {
    method: "POST",
  });
}

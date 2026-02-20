import type {
  DoctorResponse,
  ExecutionMode,
  Job,
  JobEvent,
  ModeResponse,
  ProjectsResponse,
  ProviderResponse,
  Thread,
  ThreadsResponse,
} from "@/lib/types";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method || "GET";
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    ...init,
    headers,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string"
      ? body.error
      : `${method} ${path} failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
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

export async function fetchMode(chatId: string) {
  return requestJson<ModeResponse>(`/api/mode?chatId=${encodeURIComponent(chatId)}`);
}

export async function setMode(input: { chatId: string; mode: ExecutionMode }) {
  return requestJson<{ chatId: string; executionMode: ExecutionMode }>("/api/mode", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchProjects(chatId: string) {
  return requestJson<ProjectsResponse>(`/api/projects?chatId=${encodeURIComponent(chatId)}`);
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

export async function setProvider(input: { chatId: string; provider?: string; model?: string; reasoningEffort?: string; planMode?: boolean }) {
  return requestJson<ProviderResponse>("/api/provider", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchDoctor() {
  return requestJson<DoctorResponse>("/api/doctor");
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
  path: string;
  alreadyAdded: boolean;
}

export async function discoverProjects() {
  return requestJson<{ basePath: string; discovered: DiscoveredProject[] }>("/api/projects/discover");
}

export async function deleteThread(threadId: string, chatId: string) {
  return requestJson<{ ok: true }>(`/api/threads/${encodeURIComponent(threadId)}?chatId=${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export async function renameThread(threadId: string, chatId: string, title: string) {
  return requestJson<{ thread: Thread }>(`/api/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ chatId, title }),
  });
}

export async function deleteProject(name: string, chatId: string) {
  return requestJson<{ ok: true }>(`/api/projects/${encodeURIComponent(name)}?chatId=${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export type ExecutionMode = "auto" | "interactive";

export type JobStatus =
  | "queued"
  | "pending_approval"
  | "running"
  | "completed"
  | "denied"
  | "failed";

export interface Thread {
  id: string;
  projectName: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadsResponse {
  threads: Thread[];
}

export interface Job {
  id: string;
  chatId: string;
  request: string;
  projectName: string;
  workdir: string;
  status: JobStatus;
  createdAt: string;
  queuedAt: string | null;
  pendingApprovalAt: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  deniedAt: string | null;
  summary: string | null;
  error: string | null;
}

export interface JobEvent {
  id: number;
  jobId: string;
  chatId: string;
  eventType: string;
  message: string;
  payload: Record<string, unknown> | null;
  payloadJson: string | null;
  createdAt: string;
}

export interface ApiError {
  error: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
}

export interface ProjectsResponse {
  activeProject: string;
  basePath: string;
  projects: ProjectInfo[];
}

export interface ModeResponse {
  chatId?: string;
  defaultExecutionMode?: ExecutionMode;
  executionMode?: ExecutionMode;
}

export type AIProvider = "codex" | "claude" | "gemini";

export type ReasoningEffort = "" | "low" | "medium" | "high";

export interface ProviderResponse {
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  supported: AIProvider[];
}

export interface ProviderHealthCheck {
  provider: AIProvider;
  active: boolean;
  binary: string;
  binaryInstalled: boolean;
  envKey: string;
  apiKeySet: boolean;
  ready: boolean;
}

export interface DoctorResponse {
  ok: boolean;
  activeProvider: AIProvider;
  providers: ProviderHealthCheck[];
}

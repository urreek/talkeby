export type ExecutionMode = "auto" | "interactive";

export type JobStatus =
  | "queued"
  | "pending_approval"
  | "running"
  | "completed"
  | "denied"
  | "failed"
  | "cancelled";

export interface Thread {
  id: string;
  projectName: string;
  title: string;
  status: string;
  latestJobStatus: string | null;
  bootstrapPrompt?: string | null;
  bootstrapAppliedAt?: string | null;
  autoTrimContext?: number | boolean;
  tokenBudget?: number;
  tokenUsed?: number;
  tokenUsedExact?: number;
  tokenUsedEstimated?: number;
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
  cancelledAt: string | null;
  resumedFromJobId?: string | null;
  tokenSource?: "exact" | "estimate" | string | null;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  tokenTotal?: number | null;
  providerCostUsd?: string | null;
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

export interface ImportProjectsResponse {
  ok: true;
  basePath: string;
  imported: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
  projects: ProjectInfo[];
}

export interface ModeResponse {
  chatId?: string;
  defaultExecutionMode?: ExecutionMode;
  executionMode?: ExecutionMode;
}

export type AIProvider = "codex" | "claude" | "gemini" | "groq" | "openrouter";

export type ReasoningEffort = "" | "low" | "medium" | "high";

export interface ProviderResponse {
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  supported: AIProvider[];
}

export interface ProviderCatalogModel {
  value: string;
  label: string;
  free: boolean;
}

export interface ProviderCatalogItem {
  id: AIProvider;
  label: string;
  defaultModel: string;
  supportsReasoningEffort: boolean;
  supportsPlanMode: boolean;
  models: ProviderCatalogModel[];
}

export interface ProviderCatalogResponse {
  providers: ProviderCatalogItem[];
}

export interface ProviderHealthCheck {
  provider: AIProvider;
  active: boolean;
  binary: string;
  binaryInstalled: boolean;
  envKey: string | null;
  apiKeySet: boolean;
  ready: boolean;
}

export interface DoctorResponse {
  ok: boolean;
  activeProvider: AIProvider;
  providers: ProviderHealthCheck[];
}

export interface AccessStatusResponse {
  required: boolean;
  authenticated: boolean;
  ownerChatId?: string | null;
}

export interface AgentProfileResponse {
  profile: string;
}

export type RuntimeApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "auto_approved"
  | "auto_denied";

export interface RuntimeApproval {
  id: string;
  provider: string;
  chatId: string;
  jobId: string;
  threadId: string | null;
  method: string;
  kind: string;
  status: RuntimeApprovalStatus;
  riskLevel: "low" | "medium" | "high" | string;
  summary: string;
  reason: string | null;
  command: string | null;
  cwd: string | null;
  payloadJson: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByChatId: string | null;
}

export interface RuntimeApprovalsResponse {
  approvals: RuntimeApproval[];
}

export interface ObservabilitySummary {
  windowDays: number;
  generatedAt: string;
  jobs: {
    total: number;
    completed: number;
    failed: number;
    denied: number;
    running: number;
    queued: number;
    pendingApproval: number;
    successRate: number;
    avgDurationSeconds: number;
    p95DurationSeconds: number;
    avgQueueWaitSeconds: number;
    throughputLast24h: number;
  };
  runtimeApprovals: {
    total: number;
    pending: number;
    resolved: number;
    avgDecisionSeconds: number;
  };
}

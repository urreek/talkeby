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
  lastProvider?: AIProvider | string | null;
  lastModel?: string | null;
  lastReasoningEffort?: string | null;
  tokenUsed?: number;
  tokenUsedExact?: number;
  tokenUsedEstimated?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadsResponse {
  threads: Thread[];
}

export type ThreadContextMode =
  | "native_resume"
  | "clean_native_start"
  | "fresh_context"
  | "missing_native_session"
  | "managed_thread_context";

export interface ThreadMemoryProviderRef {
  id: AIProvider | string;
  label: string;
}

export interface ThreadMemoryCurrentProvider extends ThreadMemoryProviderRef {
  model: string;
}

export interface ThreadMemoryNativeSession {
  provider: AIProvider | string;
  label: string;
  active: boolean;
  nativeSessionsSupported: boolean;
  status: "active" | "missing" | "not_supported" | string;
  hasSession: boolean;
  syncedJobId: string;
  updatedAt: string;
}

export interface ThreadMemoryInspector {
  threadId: string;
  projectName: string;
  workspacePath: string;
  currentProvider: ThreadMemoryCurrentProvider;
  lastProvider: ThreadMemoryProviderRef | null;
  latestJobProvider: ThreadMemoryProviderRef | null;
  context: {
    mode: ThreadContextMode | string;
    label: string;
    description: string;
  };
  nativeSessions: ThreadMemoryNativeSession[];
  history: {
    hasPriorVisibleHistory: boolean;
    latestJobStatus: string | null;
    visibleTurns: number;
    activeProviderCompletedTurns: number;
  };
  tokenBudget: {
    autoTrimContext: boolean;
    budget: number;
    used: number;
    remaining: number;
    percentUsed: number;
  };
  updatedAt: string;
}

export interface ThreadMemoryResponse {
  memory: ThreadMemoryInspector;
}

export interface Job {
  id: string;
  threadId: string | null;
  request: string;
  displayRequest?: string;
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
  executionMode?: ExecutionMode;
}

export type AIProvider = "codex" | "claude" | "gemini" | "copilot" | "groq" | "openrouter";

export type ReasoningEffort = "" | string;

export interface ProviderReasoningOption {
  value: string;
  label: string;
  description?: string;
}
export interface ProviderResponse {
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  sandboxMode: string;
  codexParityMode: boolean;
  codexSessionResumeEnabled: boolean;
  supported: AIProvider[];
}

export interface ProviderCatalogModel {
  value: string;
  label: string;
  free: boolean;
  reasoningEfforts?: ProviderReasoningOption[];
  defaultReasoningEffort?: string;
}

export interface ProviderCatalogItem {
  id: AIProvider;
  label: string;
  defaultModel: string;
  supportsReasoningEffort: boolean;
  reasoningEfforts?: ProviderReasoningOption[];
  defaultReasoningEffort?: string;
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
  summary?: {
    failures: number;
    warnings: number;
  };
  checks?: Array<{
    id: string;
    ok: boolean;
    severity: "error" | "warning" | "info";
    message: string;
    fix?: string | null;
  }>;
}

export interface AccessStatusResponse {
  required: boolean;
  authenticated: boolean;
}

export interface AuthSessionResponse {
  required: boolean;
  authenticated: boolean;
}

export interface AuthLoginResponse extends AuthSessionResponse {
  ok: true;
  expiresAt?: string;
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

export type TerminalSessionStatus = "running" | "closing" | "closed";

export interface TerminalSession {
  id: string;
  status: TerminalSessionStatus;
  shell: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  exitCode: number | null;
}

export interface TerminalEvent {
  id: number;
  sessionId: string;
  eventType: "terminal_status" | "terminal_output" | "terminal_input" | "terminal_exit" | string;
  stream: "stdin" | "stdout" | "stderr" | "system" | string;
  data: string;
  createdAt: string;
  exitCode: number | null;
}

export interface TerminalSnapshotResponse {
  session: TerminalSession | null;
  events: TerminalEvent[];
}



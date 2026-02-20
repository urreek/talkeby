export type ExecutionMode = "auto" | "interactive";

export type JobStatus =
  | "pending_approval"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "denied";

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

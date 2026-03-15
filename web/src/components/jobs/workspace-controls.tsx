import { ObservabilityDashboard } from "@/components/jobs/observability-dashboard";
import { RuntimeApprovalCards } from "@/components/jobs/runtime-approval-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  ObservabilitySummary,
  ProjectInfo,
  RuntimeApproval,
  Thread,
} from "@/lib/types";

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function threadStatusDotClass(status: string | null) {
  switch (status) {
    case "pending_approval":
      return "bg-amber-500 animate-pulse";
    case "running":
      return "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.5)]";
    case "failed":
      return "bg-red-500";
    case "completed":
      return "bg-emerald-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function ThreadPill({
  thread,
  isActive,
  onClick,
  onDelete,
}: {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const highlight =
    thread.latestJobStatus === "pending_approval"
      ? "ring-1 ring-amber-500/40"
      : thread.latestJobStatus === "running"
        ? "ring-1 ring-violet-500/30"
        : "";

  return (
    <div
      className={`group flex shrink-0 items-center gap-1 rounded-full border transition-all ${highlight} ${
        isActive
          ? "border-primary/30 bg-primary/15 text-primary shadow-sm"
          : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 items-center gap-2 px-4 py-2 text-xs font-medium"
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${threadStatusDotClass(thread.latestJobStatus)}`}
        />
        <span>{truncate(thread.title, 25)}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-full px-2 py-2 text-xs opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete ${thread.title}`}
      >
        x
      </button>
    </div>
  );
}

type WorkspaceControlsProps = {
  projects: ProjectInfo[];
  activeProject: string;
  threads: Thread[];
  activeThreadId?: string;
  observabilitySummary: ObservabilitySummary | null;
  runtimeApprovals: RuntimeApproval[];
  approvingRuntimeId?: string;
  denyingRuntimeId?: string;
  creatingThread: boolean;
  onApproveRuntime: (id: string) => void;
  onDenyRuntime: (id: string) => void;
  onSelectProject: (projectName: string) => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (thread: Thread) => void;
};

export function WorkspaceControls({
  projects,
  activeProject,
  threads,
  activeThreadId,
  observabilitySummary,
  runtimeApprovals,
  approvingRuntimeId,
  denyingRuntimeId,
  creatingThread,
  onApproveRuntime,
  onDenyRuntime,
  onSelectProject,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: WorkspaceControlsProps) {
  return (
    <>
      <ObservabilityDashboard summary={observabilitySummary} />

      <RuntimeApprovalCards
        approvals={runtimeApprovals}
        approvingId={approvingRuntimeId}
        denyingId={denyingRuntimeId}
        onApprove={onApproveRuntime}
        onDeny={onDenyRuntime}
      />

      {projects.length > 0 && (
        <Card className="theme-surface animate-in border-border/50 shadow-sm fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Projects
                </p>
                <p className="text-sm text-foreground">
                  Choose a workspace before sending the next task.
                </p>
              </div>
              {activeProject ? (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                  Active: {activeProject}
                </div>
              ) : null}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {projects.map((project) => (
                <button
                  key={project.name}
                  type="button"
                  onClick={() => onSelectProject(project.name)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    project.name === activeProject
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "border border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {project.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeProject && (
        <Card className="theme-surface animate-in border-border/50 shadow-sm fade-in slide-in-from-bottom-4 duration-400 fill-mode-both">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Threads
                </p>
                <p className="text-sm text-foreground">
                  {threads.length > 0
                    ? "Switch conversations or start a new one."
                    : "Start the first thread for this project."}
                </p>
              </div>
              <button
                type="button"
                onClick={onCreateThread}
                disabled={creatingThread}
                className="shrink-0 rounded-full border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-primary"
              >
                + New Thread
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {threads.map((thread) => (
                <ThreadPill
                  key={thread.id}
                  thread={thread}
                  isActive={thread.id === activeThreadId}
                  onClick={() => onSelectThread(thread.id)}
                  onDelete={() => onDeleteThread(thread)}
                />
              ))}

              {threads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No threads yet for this project.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

type MobileWorkspaceBarProps = {
  activeProject: string;
  activeThread: Thread | null;
  messageCount: number;
  pendingApprovalCount: number;
  workspaceOpen: boolean;
  creatingThread: boolean;
  onToggleWorkspace: () => void;
  onCreateThread: () => void;
};

export function MobileWorkspaceBar({
  activeProject,
  activeThread,
  messageCount,
  pendingApprovalCount,
  workspaceOpen,
  creatingThread,
  onToggleWorkspace,
  onCreateThread,
}: MobileWorkspaceBarProps) {
  const summaryTitle = activeThread?.title
    || (activeProject ? "No thread selected" : "No project selected");
  const summaryMeta = activeProject
    ? `${activeProject} | ${messageCount} message${messageCount === 1 ? "" : "s"}`
    : "Select a project to start";

  return (
    <Card className="theme-surface border-border/50 shadow-sm sm:hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Workspace
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {summaryTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {summaryMeta}
            </p>
          </div>

          <Badge
            variant="outline"
            className={pendingApprovalCount > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"}
          >
            {pendingApprovalCount > 0 ? `${pendingApprovalCount} pending` : "Ready"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl"
            onClick={onToggleWorkspace}
          >
            {workspaceOpen ? "Hide Panel" : "Open Panel"}
          </Button>
          <Button
            type="button"
            className="h-10 rounded-xl"
            disabled={!activeProject || creatingThread}
            onClick={onCreateThread}
          >
            {creatingThread ? "Creating..." : "New Thread"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

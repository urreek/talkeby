import { FolderKanban, MessageSquareText, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ProjectInfo, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

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

function threadStatusLabel(status: string | null) {
  switch (status) {
    case "pending_approval":
      return "Pending approval";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "completed":
      return "Completed";
    case "queued":
      return "Queued";
    case "denied":
      return "Denied";
    default:
      return "Idle";
  }
}

function threadStatusBadgeClass(status: string | null) {
  switch (status) {
    case "pending_approval":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300";
    case "running":
      return "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    default:
      return "border-border/60 bg-muted/40 text-muted-foreground";
  }
}

function formatProjectPath(path: string) {
  const normalized = String(path || "").trim();
  if (!normalized) {
    return "Path not available";
  }

  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }

  return `.../${parts.slice(-2).join("/")}`;
}

function formatThreadMeta(thread: Thread) {
  const tokens = Number(thread.tokenUsed || 0);
  if (tokens > 0) {
    return `${tokens.toLocaleString()} tokens burned`;
  }

  return "No token usage yet";
}

function ProjectButton({
  project,
  isActive,
  onClick,
}: {
  project: ProjectInfo;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-2xl border px-4 py-3 text-left transition-all",
        isActive
          ? "border-primary/40 bg-primary/10 shadow-sm shadow-primary/10"
          : "border-border/50 bg-muted/20 hover:border-primary/20 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {project.name}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {formatProjectPath(project.path)}
          </p>
        </div>
        {isActive ? (
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary"
          >
            Active
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

function ThreadListItem({
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
  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-2xl border px-2 py-2 transition-all",
        isActive
          ? "border-primary/40 bg-primary/10 shadow-sm shadow-primary/10"
          : "border-border/50 bg-muted/20 hover:border-primary/20 hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl px-2 py-1.5 text-left"
      >
        <span
          className={cn(
            "mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full",
            threadStatusDotClass(thread.latestJobStatus),
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {thread.title}
            </p>
            <Badge
              variant="outline"
              className={cn("text-[10px]", threadStatusBadgeClass(thread.latestJobStatus))}
            >
              {threadStatusLabel(thread.latestJobStatus)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatThreadMeta(thread)}
          </p>
        </div>
      </button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="mt-0.5 h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${thread.title}`}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

type WorkspaceSelectionPanelProps = {
  projects: ProjectInfo[];
  activeProject: string;
  threads: Thread[];
  activeThreadId?: string;
  creatingThread: boolean;
  onSelectProject: (projectName: string) => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (thread: Thread) => void;
};

export function WorkspaceSelectionPanel({
  projects,
  activeProject,
  threads,
  activeThreadId,
  creatingThread,
  onSelectProject,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: WorkspaceSelectionPanelProps) {
  return (
    <div className="space-y-4">
      <Card className="theme-surface border-border/50 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <FolderKanban className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Projects
              </p>
            </div>
          </div>

          {projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((project) => (
                <ProjectButton
                  key={project.name}
                  project={project}
                  isActive={project.name === activeProject}
                  onClick={() => onSelectProject(project.name)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
              No projects are configured yet. Add one from Settings before starting a thread.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="theme-surface border-border/50 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <MessageSquareText className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Threads
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="h-10 w-full rounded-2xl"
              disabled={!activeProject || creatingThread}
              onClick={onCreateThread}
            >
              <Plus className="size-4" />
              {creatingThread ? "Creating..." : "New Thread"}
            </Button>
          </div>

          {activeProject ? (
            threads.length > 0 ? (
              <div className="space-y-2">
                {threads.map((thread) => (
                  <ThreadListItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    onClick={() => onSelectThread(thread.id)}
                    onDelete={() => onDeleteThread(thread)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                No threads exist for this project yet.
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
              Choose a project above to unlock thread selection.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


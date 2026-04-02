import { ChevronDown, FolderKanban, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        <div className="flex items-center gap-2">
          {isActive ? (
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary"
            >
              Active
            </Badge>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isActive ? "rotate-0 text-primary" : "-rotate-90",
            )}
          />
        </div>
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
        "group flex items-center gap-1 rounded-lg border px-1 py-0.5 transition-all",
        isActive
          ? "border-primary/55 bg-primary/12 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.14)]"
          : "border-border/30 bg-transparent hover:border-primary/15 hover:bg-muted/20",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
      >
        <span
          className={cn(
            "inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
            threadStatusDotClass(thread.latestJobStatus),
          )}
        />
        <div className="min-w-0 flex flex-1 items-center gap-1.5">
          <p className="truncate text-[12px] font-medium leading-4 text-foreground">
            {thread.title}
          </p>
          <span className="text-[10px] leading-4 text-muted-foreground">-</span>
          <p className="truncate text-[10px] leading-4 text-muted-foreground">
            {formatThreadMeta(thread)}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "hidden h-4 shrink-0 rounded-sm border px-1 text-[8px] font-medium md:inline-flex",
            threadStatusBadgeClass(thread.latestJobStatus),
          )}
        >
          {threadStatusLabel(thread.latestJobStatus)}
        </Badge>
      </button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          "h-6 w-6 shrink-0 rounded-md text-muted-foreground transition-opacity hover:text-destructive",
          isActive ? "opacity-100" : "opacity-60 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
        )}
        aria-label={`Delete ${thread.title}`}
        onClick={onDelete}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

function NewThreadListItem({
  creatingThread,
  onClick,
}: {
  creatingThread: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-2 rounded-lg border border-dashed border-border/20 bg-transparent px-2 py-1 text-left opacity-70 transition-all hover:border-primary/35 hover:bg-primary/5 hover:opacity-100"
      disabled={creatingThread}
      onClick={onClick}
    >
      <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/70" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-4 text-foreground/75 transition-colors group-hover:text-foreground">
        {creatingThread ? "Creating..." : "New Thread"}
      </span>
      <Plus className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/30 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FolderKanban className="size-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Workspace
            </p>
          </div>
        </div>
      </div>

      {projects.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pt-3">
          <div className="space-y-3">
            {projects.map((project) => {
              const isActiveProject = project.name === activeProject;

              return (
                <div key={project.name} className="space-y-2 pr-5">
                  <ProjectButton
                    project={project}
                    isActive={isActiveProject}
                    onClick={() => onSelectProject(project.name)}
                  />

                  {isActiveProject ? (
                    <div className="ml-4 space-y-2 border-l border-border/50 pl-3">
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
                        <NewThreadListItem
                          creatingThread={creatingThread}
                          onClick={onCreateThread}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="pt-3">
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
            No projects are configured yet. Add one from Settings before starting a thread.
          </div>
        </div>
      )}
    </div>
  );
}


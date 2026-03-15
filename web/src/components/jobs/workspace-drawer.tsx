import { useEffect } from "react";
import { Menu, Plus, X } from "lucide-react";

import { WorkspaceSelectionPanel } from "@/components/jobs/workspace-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ProjectInfo, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspaceToolbarProps = {
  activeProject: string;
  activeThread: Thread | null;
  messageCount: number;
  pendingApprovalCount: number;
  drawerOpen: boolean;
  creatingThread: boolean;
  onToggleDrawer: () => void;
  onCreateThread: () => void;
};

function readinessBadgeClass(pendingApprovalCount: number) {
  return pendingApprovalCount > 0
    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
    : "border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
}

function workspaceSummaryText(activeProject: string, activeThread: Thread | null) {
  if (!activeProject) {
    return "Open the workspace drawer to pick a project and thread.";
  }
  if (!activeThread) {
    return `Project ${activeProject} is ready. Pick a thread or start a new one.`;
  }
  return `${activeProject} is active. Jump between threads from the workspace drawer.`;
}

function workspaceTitle(activeProject: string, activeThread: Thread | null) {
  if (!activeProject) {
    return "Choose a workspace";
  }
  if (!activeThread) {
    return "Pick a thread";
  }
  return activeThread.title;
}

export function WorkspaceToolbar({
  activeProject,
  activeThread,
  messageCount,
  pendingApprovalCount,
  drawerOpen,
  creatingThread,
  onToggleDrawer,
  onCreateThread,
}: WorkspaceToolbarProps) {
  return (
    <Card className="theme-surface shrink-0 border-border/50 shadow-sm lg:hidden">
      <CardContent className="space-y-4 p-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={drawerOpen ? "default" : "outline"}
            className="h-11 flex-1 rounded-2xl"
            onClick={onToggleDrawer}
          >
            <Menu className="size-4" />
            Workspace
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 rounded-2xl"
            disabled={!activeProject || creatingThread}
            onClick={onCreateThread}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {activeProject || "No project selected"}
          </p>
          <p className="truncate text-base font-semibold text-foreground">
            {workspaceTitle(activeProject, activeThread)}
          </p>
          <p className="text-sm text-muted-foreground">
            {workspaceSummaryText(activeProject, activeThread)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {messageCount} message{messageCount === 1 ? "" : "s"}
          </Badge>
          <Badge
            variant="outline"
            className={cn("rounded-full px-3 py-1", readinessBadgeClass(pendingApprovalCount))}
          >
            {pendingApprovalCount > 0 ? `${pendingApprovalCount} pending` : "Ready"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

type WorkspaceSharedProps = {
  activeProject: string;
  activeThread: Thread | null;
  projects: ProjectInfo[];
  threads: Thread[];
  pendingApprovalCount: number;
  creatingThread: boolean;
  onSelectProject: (projectName: string) => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (thread: Thread) => void;
};

function WorkspaceSidebarContent({
  activeProject,
  activeThread,
  projects,
  threads,
  pendingApprovalCount,
  creatingThread,
  onSelectProject,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: WorkspaceSharedProps) {
  return (
    <>
      <div className="space-y-4 px-4 pb-4 pt-5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Workspace
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">
              {workspaceTitle(activeProject, activeThread)}
            </h2>
            <p className="mt-1 text-sm text-slate-300/80">
              {workspaceSummaryText(activeProject, activeThread)}
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            className="h-10 rounded-full px-4"
            disabled={!activeProject || creatingThread}
            onClick={onCreateThread}
          >
            <Plus className="size-4" />
            {creatingThread ? "Creating..." : "New Thread"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="border border-white/10 bg-white/5 text-slate-100 hover:bg-white/5">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </Badge>
          <Badge className="border border-white/10 bg-white/5 text-slate-100 hover:bg-white/5">
            {threads.length} thread{threads.length === 1 ? "" : "s"}
          </Badge>
          <Badge className={cn("border", pendingApprovalCount > 0
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/10"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10")}
          >
            {pendingApprovalCount > 0 ? `${pendingApprovalCount} pending approvals` : "No pending approvals"}
          </Badge>
        </div>
      </div>

      <Separator className="bg-white/10" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <WorkspaceSelectionPanel
          projects={projects}
          activeProject={activeProject}
          threads={threads}
          activeThreadId={activeThread?.id}
          creatingThread={creatingThread}
          onSelectProject={onSelectProject}
          onCreateThread={onCreateThread}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
        />
      </div>
    </>
  );
}

type WorkspaceDesktopSidebarProps = WorkspaceSharedProps;

export function WorkspaceDesktopSidebar(props: WorkspaceDesktopSidebarProps) {
  return (
    <aside className="theme-surface hidden min-h-0 overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_24px_80px_rgba(15,23,42,0.35)] lg:flex lg:flex-col">
      <WorkspaceSidebarContent {...props} />
    </aside>
  );
}

type WorkspaceDrawerProps = WorkspaceSharedProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WorkspaceDrawer({
  open,
  onOpenChange,
  ...props
}: WorkspaceDrawerProps) {
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 lg:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-slate-950/72 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Workspace drawer"
        aria-hidden={!open}
        className={cn(
          "absolute inset-y-0 left-0 w-[min(24rem,calc(100vw-1rem))] max-w-full transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-r-[2rem] border-r border-white/10 bg-slate-950/92 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
          <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
              Workspace Drawer
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <WorkspaceSidebarContent
            {...props}
            onSelectThread={(threadId) => {
              props.onSelectThread(threadId);
              onOpenChange(false);
            }}
          />
        </div>
      </aside>
    </div>
  );
}

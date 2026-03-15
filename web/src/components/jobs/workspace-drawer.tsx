import { useEffect } from "react";
import { X } from "lucide-react";

import { WorkspaceSelectionPanel } from "@/components/jobs/workspace-controls";
import { Button } from "@/components/ui/button";
import type { ProjectInfo, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspaceToolbarProps = {
  activeProject: string;
  activeThread: Thread | null;
};

function workspaceTitle(activeProject: string, activeThread: Thread | null) {
  if (!activeProject) {
    return "Choose a workspace";
  }
  if (!activeThread) {
    return activeProject;
  }
  return `${activeProject} / ${activeThread.title}`;
}

export function WorkspaceToolbar({
  activeProject,
  activeThread,
}: WorkspaceToolbarProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/40 bg-card/60 px-3 py-2 backdrop-blur-xl lg:hidden">
      <p className="truncate text-[13px] font-semibold text-foreground">
        {workspaceTitle(activeProject, activeThread)}
      </p>
    </div>
  );
}

type WorkspaceSharedProps = {
  activeProject: string;
  activeThread: Thread | null;
  projects: ProjectInfo[];
  threads: Thread[];
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
  creatingThread,
  onSelectProject,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: WorkspaceSharedProps) {
  return (
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
          "absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-300 dark:bg-slate-950/72",
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
          "absolute inset-y-0 left-0 w-[78vw] max-w-[22rem] min-w-[16rem] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-r-[2rem] border-r border-border/40 bg-card/95 shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/92 dark:shadow-[0_24px_80px_rgba(15,23,42,0.55)]">
          <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Workspace Drawer
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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









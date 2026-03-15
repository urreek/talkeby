import { useEffect } from "react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Maximize2,
  Menu,
  Minimize2,
  Plus,
  X,
} from "lucide-react";

import { WorkspaceSelectionPanel } from "@/components/jobs/workspace-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ProjectInfo, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

type WorkspaceToolbarProps = {
  activeProject: string;
  activeThread: Thread | null;
  messageCount: number;
  pendingApprovalCount: number;
  drawerOpen: boolean;
  creatingThread: boolean;
  chatHidden: boolean;
  compactChat: boolean;
  onToggleDrawer: () => void;
  onCreateThread: () => void;
  onToggleChatVisibility: () => void;
  onToggleChatSize: () => void;
};

export function WorkspaceToolbar({
  activeProject,
  activeThread,
  messageCount,
  pendingApprovalCount,
  drawerOpen,
  creatingThread,
  chatHidden,
  compactChat,
  onToggleDrawer,
  onCreateThread,
  onToggleChatVisibility,
  onToggleChatSize,
}: WorkspaceToolbarProps) {
  const threadLabel = activeThread?.title || (activeProject ? "No thread selected" : "No project selected");
  const helperText = activeProject
    ? `${messageCount} message${messageCount === 1 ? "" : "s"} in the current thread`
    : "Choose a project and thread from the workspace drawer.";

  return (
    <Card className="theme-surface shrink-0 border-border/50 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Workspace
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {threadLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {helperText}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "max-w-full truncate rounded-full px-3 py-1",
                  activeProject
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/30 text-muted-foreground",
                )}
              >
                {activeProject || "No project"}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "max-w-full truncate rounded-full px-3 py-1",
                  activeThread
                    ? "border-foreground/15 bg-background/40 text-foreground"
                    : "border-border/60 bg-muted/30 text-muted-foreground",
                )}
              >
                {activeThread?.title || "No thread"}
              </Badge>
            </div>
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            type="button"
            variant={drawerOpen ? "default" : "outline"}
            className="h-10 rounded-2xl"
            onClick={onToggleDrawer}
          >
            <Menu className="size-4" />
            {drawerOpen ? "Close Drawer" : "Open Drawer"}
          </Button>

          <Button
            type="button"
            className="h-10 rounded-2xl"
            disabled={!activeProject || creatingThread}
            onClick={onCreateThread}
          >
            <Plus className="size-4" />
            {creatingThread ? "Creating..." : "New Thread"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl"
            disabled={!activeThread}
            onClick={onToggleChatVisibility}
          >
            {chatHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {chatHidden ? "Show Chat" : "Hide Chat"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-2xl"
            disabled={!activeThread || chatHidden}
            onClick={onToggleChatSize}
          >
            {compactChat ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
            {compactChat ? "Normal Chat" : "Compact Chat"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type WorkspaceDrawerProps = {
  open: boolean;
  activeProject: string;
  activeThread: Thread | null;
  projects: ProjectInfo[];
  threads: Thread[];
  pendingApprovalCount: number;
  creatingThread: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProject: (projectName: string) => void;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (thread: Thread) => void;
};

export function WorkspaceDrawer({
  open,
  activeProject,
  activeThread,
  projects,
  threads,
  pendingApprovalCount,
  creatingThread,
  onOpenChange,
  onSelectProject,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: WorkspaceDrawerProps) {
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        className={cn(
          "absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity duration-300",
          open ? "pointer-events-auto opacity-100" : "opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />

      <div className="absolute inset-y-0 left-1/2 w-full max-w-xl -translate-x-1/2">
        <button
          type="button"
          aria-label="Open workspace drawer"
          className={cn(
            "pointer-events-auto absolute left-0 top-24 z-10 flex h-28 w-12 items-center justify-center rounded-r-2xl border border-white/10 bg-slate-950/85 text-slate-100 shadow-[0_18px_60px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-all duration-300 hover:bg-slate-900/95",
            open && "-translate-x-4 opacity-0 pointer-events-none",
          )}
          onClick={() => onOpenChange(true)}
        >
          <div className="flex flex-col items-center gap-2">
            <ChevronRight className="size-4" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-[0.28em]">
              Workspace
            </span>
          </div>
        </button>

        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Workspace drawer"
          aria-hidden={!open}
          className={cn(
            "pointer-events-auto flex h-full w-[22rem] max-w-[calc(100%-0.75rem)] flex-col border-r border-white/10 bg-slate-950/90 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-2xl transition-transform duration-300 sm:w-[24rem]",
            open ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
          )}
        >
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Sidebar Drawer
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Project and thread selection
                </h2>
                <p className="mt-1 text-sm text-slate-300/80">
                  {activeProject
                    ? activeThread
                      ? `${activeProject} | ${activeThread.title}`
                      : `${activeProject} | pick a thread`
                    : "Pick a project to start working"}
                </p>
              </div>

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

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="border border-white/10 bg-white/5 text-slate-100 hover:bg-white/5">
                {projects.length} project{projects.length === 1 ? "" : "s"}
              </Badge>
              <Badge className="border border-white/10 bg-white/5 text-slate-100 hover:bg-white/5">
                {threads.length} thread{threads.length === 1 ? "" : "s"}
              </Badge>
              <Badge className={pendingApprovalCount > 0
                ? "border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/10"
                : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10"}
              >
                {pendingApprovalCount > 0 ? `${pendingApprovalCount} pending approvals` : "No pending approvals"}
              </Badge>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
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
        </aside>
      </div>
    </div>
  );
}

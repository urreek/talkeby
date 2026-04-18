import { AlertTriangle, BrainCircuit, Database, GitBranch, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ThreadMemoryInspector, ThreadMemoryNativeSession } from "@/lib/types";
import { cn } from "@/lib/utils";

type ThreadMemoryPanelProps = {
  memory?: ThreadMemoryInspector | null;
  isLoading?: boolean;
  isError?: boolean;
};

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value || "");
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function modeTone(mode: string) {
  if (mode === "native_resume") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (mode === "compact_provider_handoff") return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (mode === "missing_native_session") return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border/60 bg-muted/70 text-muted-foreground";
}

function sessionTone(session: ThreadMemoryNativeSession) {
  if (!session.nativeSessionsSupported) return "text-muted-foreground";
  if (session.hasSession) return "text-emerald-700 dark:text-emerald-300";
  return session.active ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground";
}

function latestSession(memory: ThreadMemoryInspector) {
  return memory.nativeSessions
    .filter((session) => session.hasSession && session.updatedAt)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
}

function activeSession(memory: ThreadMemoryInspector) {
  return memory.nativeSessions.find((session) => session.active) ?? null;
}

export function ThreadMemoryPanel({
  memory,
  isLoading = false,
  isError = false,
}: ThreadMemoryPanelProps) {
  if (isLoading && !memory) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
        Loading thread memory...
      </div>
    );
  }

  if (isError || !memory) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        Thread memory state is unavailable.
      </div>
    );
  }

  const activeNativeSession = activeSession(memory);
  const mostRecentSession = latestSession(memory);
  const tokenLabel = memory.tokenBudget.budget > 0
    ? `${memory.tokenBudget.percentUsed}%`
    : "off";
  const syncTime = mostRecentSession?.updatedAt ? formatRelativeTime(mostRecentSession.updatedAt) : "";

  return (
    <section className="rounded-xl border border-border/45 bg-background/70 p-3 shadow-sm backdrop-blur dark:bg-slate-950/25">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <BrainCircuit className="size-3.5" />
              Thread Memory
            </span>
            <Badge variant="outline" className={cn("border px-2 py-0.5", modeTone(memory.context.mode))}>
              {memory.context.label}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-foreground">
            {memory.context.description}
          </p>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-2 xl:min-w-[28rem]">
          <div className="rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="size-3.5" />
              Provider
            </div>
            <div className="mt-1 truncate font-medium text-foreground">
              {memory.currentProvider.label}
              {memory.currentProvider.model ? ` / ${memory.currentProvider.model}` : ""}
            </div>
          </div>

          <div className="rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <RotateCcw className="size-3.5" />
              Last Used
            </div>
            <div className="mt-1 truncate font-medium text-foreground">
              {memory.latestJobProvider?.label || memory.lastProvider?.label || "No prior provider"}
            </div>
          </div>

          <div className="rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Database className="size-3.5" />
              Native Session
            </div>
            <div className={cn("mt-1 truncate font-medium", sessionTone(activeNativeSession ?? {
              active: true,
              hasSession: false,
              nativeSessionsSupported: false,
            } as ThreadMemoryNativeSession))}>
              {!activeNativeSession?.nativeSessionsSupported
                ? "Not supported"
                : activeNativeSession.hasSession
                  ? "Active"
                  : "Missing"}
              {syncTime ? `, synced ${syncTime}` : ""}
            </div>
          </div>

          <div className="rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <AlertTriangle className="size-3.5" />
              Budget
            </div>
            <div className="mt-1 truncate font-medium text-foreground">
              {tokenLabel}
              {memory.tokenBudget.autoTrimContext ? " auto-trim" : " manual"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/35 pt-3">
        {memory.nativeSessions
          .filter((session) => session.nativeSessionsSupported)
          .map((session) => (
            <span
              key={session.provider}
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] font-medium",
                session.active ? "border-primary/35 bg-primary/10 text-primary" : "border-border/45 bg-muted/35",
                sessionTone(session),
              )}
            >
              {session.label}: {session.hasSession ? "active" : "missing"}
            </span>
          ))}
      </div>
    </section>
  );
}

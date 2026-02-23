import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { JobStatus } from "@/lib/types";

const variantByStatus: Record<
  JobStatus,
  "default" | "secondary" | "destructive"
> = {
  pending_approval: "secondary",
  queued: "secondary",
  running: "default",
  completed: "secondary",
  failed: "destructive",
  denied: "destructive",
  cancelled: "destructive",
};

const classByStatus: Record<JobStatus, string> = {
  pending_approval:
    "bg-amber-600 text-white dark:bg-amber-500/15 dark:text-amber-400 hover:bg-amber-700 dark:hover:bg-amber-500/25 border-transparent",
  queued:
    "bg-slate-700 text-white dark:bg-white/10 dark:text-white/70 hover:bg-slate-800 border-transparent",
  running:
    "bg-blue-600 text-white dark:bg-violet-500/20 dark:text-violet-400 hover:bg-blue-700 dark:hover:bg-violet-500/30 border-transparent",
  completed:
    "bg-emerald-600 text-white dark:bg-cyan-500/15 dark:text-cyan-400 hover:bg-emerald-700 dark:hover:bg-cyan-500/25 border-transparent",
  failed:
    "bg-red-600 text-white dark:bg-red-500/15 dark:text-red-400 hover:bg-red-700 dark:hover:bg-red-500/25 border-transparent",
  denied:
    "bg-red-600 text-white dark:bg-red-500/15 dark:text-red-400 hover:bg-red-700 dark:hover:bg-red-500/25 border-transparent",
  cancelled:
    "bg-zinc-700 text-white dark:bg-zinc-500/20 dark:text-zinc-300 hover:bg-zinc-800 dark:hover:bg-zinc-500/30 border-transparent",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge
      variant={variantByStatus[status]}
      className={cn(classByStatus[status])}
    >
      {label}
    </Badge>
  );
}

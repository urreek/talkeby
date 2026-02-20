import { Activity, Clock3, ShieldCheck, Sparkles } from "lucide-react";

import { StatusBadge } from "@/components/jobs/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExecutionMode, Job } from "@/lib/types";

type StatusOverviewProps = {
  mode: ExecutionMode;
  job: Job | undefined;
};

export function StatusOverview({ mode, job }: StatusOverviewProps) {
  return (
    <Card className="theme-surface relative overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card/80 to-primary/5 shadow-lg shadow-primary/5">
      <div className="absolute -right-20 -top-20 z-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <CardHeader className="relative z-10 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <div className="relative flex items-center justify-center rounded-lg bg-primary/20 p-1.5 text-primary">
            <Sparkles className="size-4" />
            <div className="absolute inset-0 animate-pulse rounded-lg bg-primary/20 blur-sm" />
          </div>
          <span className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Home Runner
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 space-y-3 text-sm">
        <div className="theme-muted-surface flex items-center justify-between rounded-xl border border-white/5 bg-background/50 px-4 py-2.5 transition-colors hover:bg-background/80">
          <span className="inline-flex items-center gap-2 font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-cyan-700 dark:text-cyan-400" />
            Mode
          </span>
          <div className="min-w-[80px] flex items-center justify-end">
            <span className="font-bold capitalize tracking-tight">{mode}</span>
          </div>
        </div>
        <div className="theme-muted-surface flex items-center justify-between rounded-xl border border-white/5 bg-background/50 px-4 py-2.5 transition-colors hover:bg-background/80">
          <span className="inline-flex items-center gap-2 font-medium text-muted-foreground">
            <Activity className="size-4 text-primary" />
            Latest Job
          </span>
          <span className="font-bold capitalize tracking-tight">
            {job ? job.status.replace(/_/g, " ") : "none"}
          </span>
        </div>
        <div className="theme-muted-surface flex items-center justify-between rounded-xl border border-white/5 bg-background/50 px-4 py-2.5 transition-colors hover:bg-background/80">
          <span className="inline-flex items-center gap-2 font-medium text-muted-foreground">
            <Clock3 className="size-4 text-amber-600 dark:text-amber-500" />
            Job ID
          </span>
          <div className="min-w-[80px] flex items-center justify-end">
            <span className="font-mono text-xs font-semibold">
              {job?.id ?? "-"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

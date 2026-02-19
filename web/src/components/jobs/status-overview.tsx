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
    <Card className="overflow-hidden border-none bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Sparkles className="size-4" />
          Home Runner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />Mode</span>
          <span className="font-semibold capitalize">{mode}</span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
          <span className="inline-flex items-center gap-2"><Activity className="size-4" />Latest Job</span>
          {job ? <StatusBadge status={job.status} /> : <span className="text-xs text-white/80">none</span>}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
          <span className="inline-flex items-center gap-2"><Clock3 className="size-4" />Job ID</span>
          <span className="font-mono text-xs">{job?.id ?? "-"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

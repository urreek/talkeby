import { Link } from "@tanstack/react-router";

import { StatusBadge } from "@/components/jobs/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Job } from "@/lib/types";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
}

export function JobCard({ job }: { job: Job }) {
  return (
    <Card className="theme-surface group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        pointer-events="none"
      />
      <CardHeader className="relative z-10 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-mono text-sm tracking-tight text-foreground/90">
            {job.id}
          </CardTitle>
          <StatusBadge status={job.status} />
        </div>
        <CardDescription className="font-medium text-primary/80">
          {job.projectName}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <p className="text-sm leading-relaxed text-foreground">{job.request}</p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Created: {formatTimestamp(job.createdAt)}
        </p>
      </CardContent>
      <CardFooter className="relative z-10 justify-between items-center border-t border-border/40 pt-4 pb-4">
        <p className="font-mono text-[10px] text-muted-foreground/60 break-all">
          {job.workdir}
        </p>
        <Link
          className="rounded-full bg-secondary/80 px-4 py-1.5 text-xs font-semibold text-secondary-foreground transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:shadow-md active:scale-95"
          to="/timeline/$jobId"
          params={{ jobId: job.id }}
        >
          Timeline
        </Link>
      </CardFooter>
    </Card>
  );
}

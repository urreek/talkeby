import { Link } from "@tanstack/react-router";

import { StatusBadge } from "@/components/jobs/status-badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-mono text-sm">{job.id}</CardTitle>
          <StatusBadge status={job.status} />
        </div>
        <CardDescription>{job.projectName}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground/90">{job.request}</p>
        <p className="text-xs text-muted-foreground">Created: {formatTimestamp(job.createdAt)}</p>
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-xs text-muted-foreground">{job.workdir}</p>
        <Link
          className="rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
          to="/timeline/$jobId"
          params={{ jobId: job.id }}
        >
          Timeline
        </Link>
      </CardFooter>
    </Card>
  );
}

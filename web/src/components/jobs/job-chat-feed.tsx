import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/types";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString();
}

function statusLabel(status: string) {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "denied":
      return "Denied";
    case "pending_approval":
      return "Awaiting Approval";
    default:
      return "Queued";
  }
}

function assistantMessage(job: Job) {
  if (job.status === "completed") {
    return job.summary?.trim() || "Done. The job completed successfully.";
  }
  if (job.status === "failed") {
    return job.error?.trim() || "I hit an error while running this job.";
  }
  if (job.status === "denied") {
    return "Request denied. I did not run this job.";
  }
  if (job.status === "pending_approval") {
    return "I need your approval before continuing this task.";
  }
  if (job.status === "running") {
    return "Working on it now. I will post the result here when done.";
  }
  return "Queued. I will start this shortly and keep you updated.";
}

type JobChatFeedProps = {
  jobs: Job[];
  approvingJobId?: string;
  denyingJobId?: string;
  onApprove?: (jobId: string) => void;
  onDeny?: (jobId: string) => void;
};

export function JobChatFeed({
  jobs,
  approvingJobId,
  denyingJobId,
  onApprove,
  onDeny,
}: JobChatFeedProps) {
  const scrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [jobs]);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No threads yet. Send a task above to start.
      </p>
    );
  }

  const ordered = jobs.slice(0, 30).reverse();

  return (
    <section ref={scrollRef} className="space-y-4">
      {ordered.map((job) => (
        <div key={job.id} className="space-y-3">
          {/* User message */}
          <div className="theme-muted-surface ml-8 rounded-2xl p-4 shadow-sm border border-white/5 transition-all hover:bg-muted/60">
            <p className="text-xs font-medium text-muted-foreground">
              You · {formatTimestamp(job.createdAt)}
            </p>
            <p className="mt-1.5 text-sm text-foreground leading-relaxed">
              {job.request}
            </p>
          </div>

          {/* Agent message */}
          <div className="theme-surface mr-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/5 p-4 shadow-md backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary/80">
                Agent · {job.projectName}
              </p>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  job.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : job.status === "running"
                      ? "bg-violet-500/10 text-violet-500"
                      : job.status === "failed"
                        ? "bg-red-500/10 text-red-500"
                        : job.status === "pending_approval"
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-muted text-muted-foreground"
                }`}
              >
                {statusLabel(job.status)}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
              {assistantMessage(job)}
            </p>

            {/* Inline approve/deny for pending jobs */}
            {job.status === "pending_approval" && onApprove && onDeny && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={approvingJobId === job.id}
                  onClick={() => onApprove(job.id)}
                >
                  {approvingJobId === job.id ? "Approving..." : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={denyingJobId === job.id}
                  onClick={() => onDeny(job.id)}
                >
                  {denyingJobId === job.id ? "Denying..." : "Deny"}
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

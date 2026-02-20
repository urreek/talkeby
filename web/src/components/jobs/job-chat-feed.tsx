import { useEffect, useRef } from "react";

import type { Job } from "@/lib/types";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString();
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

export function JobChatFeed({ jobs }: { jobs: Job[] }) {
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
      <p className="chat-message-meta text-sm text-muted-foreground">
        No messages yet. Send a task and Agent will respond here.
      </p>
    );
  }

  const ordered = jobs.slice(0, 20).reverse();

  return (
    <section
      ref={scrollRef}
      className="max-h-[52vh] min-h-[220px] space-y-4 overflow-y-auto overscroll-contain pr-2"
    >
      {ordered.map((job) => (
        <div key={job.id} className="space-y-3">
          <div className="theme-muted-surface ml-8 rounded-2xl p-4 shadow-sm border border-white/5 transition-all hover:bg-muted/60">
            <p className="chat-message-meta text-xs font-medium text-muted-foreground">
              You · {formatTimestamp(job.createdAt)}
            </p>
            <p className="chat-message-body mt-1.5 text-sm text-foreground leading-relaxed">
              {job.request}
            </p>
          </div>
          <div className="theme-surface mr-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/5 p-4 shadow-md backdrop-blur-md">
            <p className="chat-message-meta text-xs font-semibold text-primary/80">
              Agent · {job.projectName}
            </p>
            <p className="chat-message-body mt-1.5 whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
              {assistantMessage(job)}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

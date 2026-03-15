import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { isSoundsEnabled, playCompleted, playFailed, playNeedsApproval } from "@/lib/sounds";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString();
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function durationBetween(start: string, end: string): string {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return "";
  const ms = Math.max(0, e - s);
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "0";
  }
  return Math.round(value).toLocaleString();
}

function tokenUsageLine(job: Job): string {
  const source = (job.tokenSource || "estimate").toString().toLowerCase();
  if (source === "internal") {
    return "Answered from visible thread history (no provider tokens used).";
  }
  if (source === "provider_unavailable") {
    return "Tokens unavailable from provider for this run.";
  }
  const isFinal =
    job.status === "completed"
    || job.status === "failed"
    || job.status === "denied"
    || job.status === "cancelled";
  if (!isFinal && !job.tokenTotal) {
    return "Tokens calculating...";
  }
  const total = formatTokenCount(job.tokenTotal);
  const input = formatTokenCount(job.tokenInput);
  const output = formatTokenCount(job.tokenOutput);
  return `Tokens ${total} (in ${input} / out ${output}, ${source})`;
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
    case "cancelled":
      return "Cancelled";
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
  if (job.status === "cancelled") {
    return "Stopped. The job was cancelled before completion.";
  }
  if (job.status === "pending_approval") {
    return "I need your approval before continuing this task.";
  }
  return null;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function TypingIndicator({
  startedAt,
  jobId,
  threadId,
}: {
  startedAt?: string | null;
  jobId: string;
  threadId?: string | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [dots, setDots] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
    if (Number.isNaN(startMs)) return;

    const timer = setInterval(() => {
      setElapsed(Date.now() - startMs);
      setDots((value) => (value + 1) % 4);
    }, 500);

    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!jobId) return;

    const params = new URLSearchParams();
    if (threadId) {
      params.set("threadId", threadId);
    }
    const query = params.toString();
    const source = new EventSource(
      `/api/jobs/${encodeURIComponent(jobId)}/stream${query ? `?${query}` : ""}`,
    );

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { line?: string };
        if (data.line) {
          setLines((current) => {
            const next = [...current, data.line || ""];
            return next.length > 50 ? next.slice(-50) : next;
          });
        }
      } catch {
        // Ignore malformed lines and keep the stream alive.
      }
    };

    return () => source.close();
  }, [jobId, threadId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const thinkingPhrases = [
    "Analyzing your request",
    "Writing code",
    "Thinking",
    "Working on it",
    "Processing",
  ];
  const phraseIndex = Math.floor(elapsed / 4000) % thinkingPhrases.length;
  const phrase = thinkingPhrases[phraseIndex];
  const dotStr = ".".repeat(dots + 1);
  const visibleLines = lines.slice(-8);

  return (
    <div className="mt-1.5 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full bg-violet-500 animate-bounce"
            style={{ animationDelay: "0ms", animationDuration: "1s" }}
          />
          <span
            className="inline-block h-2 w-2 rounded-full bg-violet-500 animate-bounce"
            style={{ animationDelay: "150ms", animationDuration: "1s" }}
          />
          <span
            className="inline-block h-2 w-2 rounded-full bg-violet-500 animate-bounce"
            style={{ animationDelay: "300ms", animationDuration: "1s" }}
          />
        </div>
        <span className="text-sm font-medium text-violet-400">
          {phrase}
          <span className="inline-block w-4 text-left">{dotStr}</span>
        </span>
      </div>

      {visibleLines.length > 0 && (
        <div
          ref={scrollRef}
          className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-violet-500/10 bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-violet-300/80 scrollbar-none"
        >
          {visibleLines.map((line, index) => (
            <div
              key={`${index}:${line}`}
              className="animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
        <span>{formatElapsed(elapsed)} elapsed</span>
        {lines.length > 0 && (
          <span className="text-violet-400/50">- {lines.length} lines</span>
        )}
      </div>
    </div>
  );
}

function TimelineConnector({ duration }: { duration: string }) {
  if (!duration) return null;
  return (
    <div className="flex items-center gap-2 py-0.5 pl-4">
      <div className="flex flex-col items-center">
        <div className="h-2 w-px bg-border" />
        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <div className="h-2 w-px bg-border" />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">
        {duration}
      </span>
    </div>
  );
}

type JobChatFeedProps = {
  threadId: string;
  jobs: Job[];
  className?: string;
  approvingJobId?: string;
  denyingJobId?: string;
  resumingJobId?: string;
  stoppingJobId?: string;
  onApprove?: (jobId: string) => void;
  onDeny?: (jobId: string) => void;
  onResumeError?: (jobId: string) => void;
  onStop?: (jobId: string) => void;
};

export function JobChatFeed({
  threadId,
  jobs,
  className,
  approvingJobId,
  denyingJobId,
  resumingJobId,
  stoppingJobId,
  onApprove,
  onDeny,
  onResumeError,
  onStop,
}: JobChatFeedProps) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const prevStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [jobs]);

  useEffect(() => {
    if (!isSoundsEnabled()) return;

    const previous = prevStatusesRef.current;
    for (const job of jobs) {
      const oldStatus = previous[job.id];
      if (oldStatus && oldStatus !== job.status) {
        if (job.status === "completed") playCompleted();
        else if (job.status === "failed") playFailed();
        else if (job.status === "pending_approval") playNeedsApproval();
      }
    }

    const next: Record<string, string> = {};
    for (const job of jobs) {
      next[job.id] = job.status;
    }
    prevStatusesRef.current = next;
  }, [jobs]);

  if (jobs.length === 0) {
    return (
      <section
        ref={scrollRef}
        className={cn("flex min-h-0 flex-1 items-center justify-center", className)}
      >
        <div className="theme-muted-surface w-full rounded-[1.75rem] border border-white/5 px-6 py-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            No messages yet. Send a task to start.
          </p>
        </div>
      </section>
    );
  }

  const ordered = jobs
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.createdAt || ""));
      const rightTime = Date.parse(String(right.createdAt || ""));
      return leftTime - rightTime;
    })
    .slice(-30);

  return (
    <section
      ref={scrollRef}
      className={cn(
        "min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-none",
        className,
      )}
    >
      {ordered.map((job, index) => {
        const message = assistantMessage(job);
        const isWorking = job.status === "running" || job.status === "queued";
        const previousJob = index > 0 ? ordered[index - 1] : null;
        const gap =
          previousJob?.completedAt && job.createdAt
            ? durationBetween(previousJob.completedAt, job.createdAt)
            : "";
        const agentDuration =
          job.startedAt && job.completedAt
            ? durationBetween(job.startedAt, job.completedAt)
            : "";

        return (
          <div key={job.id}>
            {gap && <TimelineConnector duration={gap} />}

            <div className="space-y-3 py-2">
              <div className="theme-muted-surface ml-auto max-w-[90%] rounded-[1.75rem] border border-white/5 p-4 shadow-sm transition-all hover:bg-muted/60">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    You | {formatTimestamp(job.createdAt)}
                  </p>
                  <span className="text-[10px] text-muted-foreground/60">
                    {relativeTime(job.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                  {job.request}
                </p>
              </div>

              <div
                className={`theme-surface mr-auto max-w-[94%] rounded-[1.75rem] border p-4 shadow-md backdrop-blur-md transition-all ${
                  isWorking
                    ? "border-violet-500/30 bg-gradient-to-br from-card to-violet-500/5"
                    : "border-primary/20 bg-gradient-to-br from-card to-primary/5"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-primary/80">
                    Agent | {job.projectName}
                  </p>
                  <div className="flex items-center gap-2">
                    {agentDuration && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {agentDuration}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        job.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : job.status === "running"
                            ? "bg-violet-500/10 text-violet-500 animate-pulse"
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
                </div>

                {isWorking ? (
                  <TypingIndicator
                    startedAt={job.startedAt}
                    jobId={job.id}
                    threadId={threadId}
                  />
                ) : (
                  <div className="prose prose-sm mt-1.5 max-w-none text-sm leading-relaxed text-foreground/90 prose-headings:my-2 prose-li:my-0 prose-ol:my-1 prose-p:my-1 prose-pre:my-2 prose-pre:rounded-lg prose-pre:border prose-pre:border-border/50 prose-pre:bg-muted/55 prose-code:text-xs prose-code:text-primary prose-a:text-primary prose-a:no-underline prose-ul:my-1 hover:prose-a:underline dark:prose-invert dark:prose-pre:border-white/5 dark:prose-pre:bg-black/30 dark:prose-code:text-violet-300">
                    <Markdown
                      components={{
                        pre: ({ children }) => (
                          <pre className="overflow-x-auto p-3 text-xs">
                            {children}
                          </pre>
                        ),
                        code: ({ className: markdownClassName, children, ...props }) => {
                          const isBlock = markdownClassName?.startsWith("language-");
                          if (isBlock) {
                            const language = markdownClassName?.replace("language-", "") || "";
                            return (
                              <div>
                                {language && (
                                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                    {language}
                                  </span>
                                )}
                                <code className={markdownClassName} {...props}>
                                  {children}
                                </code>
                              </div>
                            );
                          }
                          return (
                            <code
                              className="rounded bg-muted/60 px-1.5 py-0.5 text-xs font-mono dark:bg-white/5"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {message ?? ""}
                    </Markdown>
                  </div>
                )}

                <p className="mt-3 text-[11px] text-muted-foreground">
                  {tokenUsageLine(job)}
                </p>

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

                {job.status === "failed" && onResumeError && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={resumingJobId === job.id}
                      onClick={() => onResumeError(job.id)}
                    >
                      {resumingJobId === job.id ? "Resuming..." : "Resume from error"}
                    </Button>
                  </div>
                )}

                {(job.status === "running"
                  || job.status === "queued"
                  || job.status === "pending_approval")
                  && onStop && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={stoppingJobId === job.id}
                        onClick={() => onStop(job.id)}
                      >
                        {stoppingJobId === job.id ? "Stopping..." : "Stop"}
                      </Button>
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

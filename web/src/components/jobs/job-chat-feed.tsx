import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/types";
import {
  isSoundsEnabled,
  playCompleted,
  playFailed,
  playNeedsApproval,
} from "@/lib/sounds";

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
}: {
  startedAt?: string | null;
  jobId: string;
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
      setDots((d) => (d + 1) % 4);
    }, 500);

    return () => clearInterval(timer);
  }, [startedAt]);

  // SSE live output
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/stream`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.line) {
          setLines((prev) => {
            const next = [...prev, data.line];
            return next.length > 50 ? next.slice(-50) : next;
          });
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [jobId]);

  // Auto-scroll live output
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
        <span className="text-sm text-violet-400 font-medium">
          {phrase}
          <span className="inline-block w-4 text-left">{dotStr}</span>
        </span>
      </div>

      {/* Live output stream */}
      {visibleLines.length > 0 && (
        <div
          ref={scrollRef}
          className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-black/20 border border-violet-500/10 p-2 font-mono text-[11px] text-violet-300/80 leading-relaxed scrollbar-none"
        >
          {visibleLines.map((line, i) => (
            <div
              key={i}
              className="animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
        <span>{formatElapsed(elapsed)} elapsed</span>
        {lines.length > 0 && (
          <span className="text-violet-400/50">· {lines.length} lines</span>
        )}
      </div>
    </div>
  );
}

/** Timeline dot + connector between messages */
function TimelineConnector({ duration }: { duration: string }) {
  if (!duration) return null;
  return (
    <div className="flex items-center gap-2 pl-4 py-0.5">
      <div className="flex flex-col items-center">
        <div className="w-px h-2 bg-border" />
        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <div className="w-px h-2 bg-border" />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">
        ⏱ {duration}
      </span>
    </div>
  );
}

type JobChatFeedProps = {
  jobs: Job[];
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
  jobs,
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

  // Sound effects on status change
  useEffect(() => {
    if (!isSoundsEnabled()) return;
    const prev = prevStatusesRef.current;
    for (const job of jobs) {
      const old = prev[job.id];
      if (old && old !== job.status) {
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
      <p className="text-sm text-muted-foreground text-center py-8">
        No messages yet. Send a task to start.
      </p>
    );
  }

  const ordered = jobs
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(String(a.createdAt || ""));
      const bTime = Date.parse(String(b.createdAt || ""));
      return aTime - bTime;
    })
    .slice(-30);

  return (
    <section
      ref={scrollRef}
      className="h-[52vh] min-h-[320px] max-h-[620px] overflow-y-auto pr-1 space-y-1"
    >
      {ordered.map((job, index) => {
        const msg = assistantMessage(job);
        const isWorking = job.status === "running" || job.status === "queued";

        // Timeline: duration from previous job's completion to this one
        const prevJob = index > 0 ? ordered[index - 1] : null;
        const gap =
          prevJob?.completedAt && job.createdAt
            ? durationBetween(prevJob.completedAt, job.createdAt)
            : "";

        // Duration the agent took on this job
        const agentDuration =
          job.startedAt && job.completedAt
            ? durationBetween(job.startedAt, job.completedAt)
            : "";

        return (
          <div key={job.id}>
            {/* Timeline gap between messages */}
            {gap && <TimelineConnector duration={gap} />}

            <div className="space-y-3 py-1">
              {/* User message */}
              <div className="theme-muted-surface ml-8 rounded-2xl p-4 shadow-sm border border-white/5 transition-all hover:bg-muted/60">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    You · {formatTimestamp(job.createdAt)}
                  </p>
                  <span className="text-[10px] text-muted-foreground/60">
                    {relativeTime(job.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-foreground leading-relaxed">
                  {job.request}
                </p>
              </div>

              {/* Agent message */}
              <div
                className={`theme-surface mr-8 rounded-2xl border p-4 shadow-md backdrop-blur-md transition-all ${
                  isWorking
                    ? "border-violet-500/30 bg-gradient-to-br from-card to-violet-500/5"
                    : "border-primary/20 bg-gradient-to-br from-card to-primary/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-primary/80">
                    Agent · {job.projectName}
                  </p>
                  <div className="flex items-center gap-2">
                    {agentDuration && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {agentDuration}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
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
                  <TypingIndicator startedAt={job.startedAt} jobId={job.id} />
                ) : (
                  <div className="mt-1.5 text-sm text-foreground/90 leading-relaxed prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/5 prose-pre:rounded-lg prose-code:text-violet-300 prose-code:text-xs prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                    <Markdown
                      components={{
                        pre: ({ children }) => (
                          <pre className="overflow-x-auto p-3 text-xs">
                            {children}
                          </pre>
                        ),
                        code: ({ className, children, ...props }) => {
                          const isBlock = className?.startsWith("language-");
                          if (isBlock) {
                            const lang =
                              className?.replace("language-", "") || "";
                            return (
                              <div>
                                {lang && (
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-mono">
                                    {lang}
                                  </span>
                                )}
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              </div>
                            );
                          }
                          return (
                            <code
                              className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-mono"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg ?? ""}
                    </Markdown>
                  </div>
                )}

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {tokenUsageLine(job)}
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

                {(job.status === "failed") && onResumeError && (
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

                {(job.status === "running" || job.status === "queued" || job.status === "pending_approval") && onStop && (
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

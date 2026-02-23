import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import { ObservabilityDashboard } from "@/components/jobs/observability-dashboard";
import { RuntimeApprovalCards } from "@/components/jobs/runtime-approval-cards";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveJob,
  approveRuntimeApproval,
  createJob,
  createThread,
  deleteThread,
  denyJob,
  denyRuntimeApproval,
  fetchObservability,
  fetchProjects,
  fetchRuntimeApprovals,
  fetchThreadJobs,
  fetchThreads,
  renameThread,
  resumeJobFromError,
  stopJob,
  setThreadAutoTrimContext,
} from "@/lib/api";
import { getStoredChatId } from "@/lib/storage";
import type { Thread } from "@/lib/types";
import { rootRoute } from "@/routes/__root";

export const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: JobsScreen,
});

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

function JobsScreen() {
  const queryClient = useQueryClient();
  const chatId = getStoredChatId();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Fetch projects
  const projectsQuery = useQuery({
    queryKey: ["projects", chatId],
    queryFn: () => fetchProjects(chatId),
    enabled: Boolean(chatId),
  });

  const projects = projectsQuery.data?.projects ?? [];
  const activeProject =
    selectedProject ||
    projectsQuery.data?.activeProject ||
    projects[0]?.name ||
    "";

  // Fetch threads for the active project
  const threadsQuery = useQuery({
    queryKey: ["threads", activeProject],
    queryFn: () => fetchThreads(activeProject),
    enabled: Boolean(activeProject),
    refetchInterval: 5000,
  });

  const threads = threadsQuery.data?.threads ?? [];
  const activeThread =
    threads.find((t) => t.id === selectedThreadId) ?? threads[0] ?? null;

  // Fetch jobs for the selected thread
  const threadJobsQuery = useQuery({
    queryKey: ["threadJobs", activeThread?.id],
    queryFn: () => fetchThreadJobs(activeThread!.id),
    enabled: Boolean(activeThread?.id),
    refetchInterval: 3000,
  });

  const threadJobs = threadJobsQuery.data?.jobs ?? [];

  const observabilityQuery = useQuery({
    queryKey: ["observability", chatId],
    queryFn: () => fetchObservability(chatId),
    enabled: Boolean(chatId),
    refetchInterval: 15000,
  });

  const runtimeApprovalsQuery = useQuery({
    queryKey: ["runtimeApprovals", chatId],
    queryFn: () => fetchRuntimeApprovals({ chatId, status: "pending", limit: 100 }),
    enabled: Boolean(chatId),
    refetchInterval: 3000,
  });

  // Create new thread
  const createThreadMutation = useMutation({
    mutationFn: () => createThread({ chatId, projectName: activeProject }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setSelectedThreadId(data.thread.id);
    },
  });

  // Send task to thread
  const createJobMutation = useMutation({
    mutationFn: (input: { task: string; projectName: string }) =>
      createJob({
        chatId,
        task: input.task,
        projectName: input.projectName,
        threadId: activeThread?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (jobId: string) => approveJob({ jobId, chatId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] }),
  });

  const denyMutation = useMutation({
    mutationFn: (jobId: string) => denyJob({ jobId, chatId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => resumeJobFromError({ jobId, chatId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (jobId: string) => stopJob({ jobId, chatId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const approveRuntimeMutation = useMutation({
    mutationFn: (id: string) => approveRuntimeApproval({ id, chatId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runtimeApprovals", chatId] });
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] });
    },
  });

  const denyRuntimeMutation = useMutation({
    mutationFn: (id: string) => denyRuntimeApproval({ id, chatId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runtimeApprovals", chatId] });
      queryClient.invalidateQueries({ queryKey: ["threadJobs"] });
    },
  });

  const deleteThreadMutation = useMutation({
    mutationFn: (threadId: string) => deleteThread(threadId, chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setSelectedThreadId(null);
    },
  });

  const renameThreadMutation = useMutation({
    mutationFn: (input: { threadId: string; title: string }) =>
      renameThread(input.threadId, chatId, input.title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["threads"] }),
  });
  const threadAutoTrimMutation = useMutation({
    mutationFn: (input: { threadId: string; autoTrimContext: boolean }) =>
      setThreadAutoTrimContext(input.threadId, chatId, input.autoTrimContext),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["threads"] }),
  });

  const createJobErrorMessage = createJobMutation.isError
    ? readErrorMessage(
      createJobMutation.error,
      "Could not run task. Check backend logs and try again.",
    )
    : "";

  const budget = Number(activeThread?.tokenBudget || 0);
  const used = Number(activeThread?.tokenUsed || 0);
  const remaining = budget > 0 ? Math.max(0, budget - used) : 0;
  const progress = budget > 0 ? Math.max(0, Math.min(100, Math.round((used / Math.max(1, budget)) * 100))) : 0;
  const autoTrimValue = Boolean(activeThread?.autoTrimContext) ? "on" : "off";

  return (
    <div className="space-y-4">
      <ObservabilityDashboard summary={observabilityQuery.data ?? null} />

      <RuntimeApprovalCards
        approvals={runtimeApprovalsQuery.data?.approvals ?? []}
        approvingId={approveRuntimeMutation.variables ?? ""}
        denyingId={denyRuntimeMutation.variables ?? ""}
        onApprove={(id) => approveRuntimeMutation.mutate(id)}
        onDeny={(id) => denyRuntimeMutation.mutate(id)}
      />

      {/* Project tabs */}
      {projects.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {projects.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setSelectedProject(p.name);
                  setSelectedThreadId(null);
                }}
                className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  p.name === activeProject
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thread tabs + New Thread */}
      {activeProject && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400 fill-mode-both">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {threads.map((thread) => (
              <ThreadPill
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThread?.id}
                onClick={() => setSelectedThreadId(thread.id)}
                onDelete={async () => {
                  const confirmed = await confirm({
                    title: `Delete "${thread.title}"?`,
                    description:
                      "This will permanently remove the thread and its CLI session from disk. This cannot be undone.",
                    confirmLabel: "Delete",
                    variant: "destructive",
                  });
                  if (confirmed) {
                    deleteThreadMutation.mutate(thread.id);
                  }
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => createThreadMutation.mutate()}
              disabled={createThreadMutation.isPending}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
            >
              + New Thread
            </button>
          </div>
        </div>
      )}

      {/* Chat feed */}
      <div className="animate-in fade-in slide-in-from-bottom-6 duration-500 fill-mode-both">
        {activeThread ? (
          <Card className="theme-surface relative overflow-hidden border-border/50 shadow-md">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <CardHeader className="pb-2">
              <EditableTitle
                title={activeThread.title}
                onSave={(title) =>
                  renameThreadMutation.mutate({
                    threadId: activeThread.id,
                    title,
                  })
                }
              />
              <CardDescription className="text-xs text-muted-foreground">
                {activeProject} · {threadJobs.length} message
                {threadJobs.length !== 1 ? "s" : ""} · tokens {used}/{budget || "unlimited"}
              </CardDescription>
              <div className="pt-1 space-y-2">
                {budget > 0 && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Remaining: {remaining} tokens ({progress}% used)
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Auto-Trim</span>
                    <Select
                      value={autoTrimValue}
                      onValueChange={(value) => {
                        threadAutoTrimMutation.mutate({
                          threadId: activeThread.id,
                          autoTrimContext: value === "on",
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue placeholder="Auto-Trim" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on">On</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <JobChatFeed
                jobs={threadJobs}
                approvingJobId={approveMutation.variables ?? ""}
                denyingJobId={denyMutation.variables ?? ""}
                resumingJobId={resumeMutation.variables ?? ""}
                stoppingJobId={stopMutation.variables ?? ""}
                onApprove={(jobId) => approveMutation.mutate(jobId)}
                onDeny={(jobId) => denyMutation.mutate(jobId)}
                onResumeError={(jobId) => resumeMutation.mutate(jobId)}
                onStop={(jobId) => stopMutation.mutate(jobId)}
              />
            </CardContent>
          </Card>
        ) : (
          <Card
            className="theme-surface cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
            onClick={() => {
              if (activeProject) createThreadMutation.mutate();
            }}
          >
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {!activeProject
                  ? "Select a project or add one in Settings."
                  : "No threads yet. Click here to start one."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* New Task composer */}
      {activeThread && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-75 fill-mode-both">
          <CreateJobForm
            projects={projects}
            activeProject={activeProject}
            isSubmitting={createJobMutation.isPending}
            submitError={createJobErrorMessage}
            onSubmit={async (input) => {
              createJobMutation.reset();
              await createJobMutation.mutateAsync(input);
            }}
          />
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}

function ThreadPill({
  thread,
  isActive,
  onClick,
  onDelete,
}: {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const dotClass = (() => {
    switch (thread.latestJobStatus) {
      case "pending_approval":
        return "bg-amber-500 animate-pulse";
      case "running":
        return "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.5)]";
      case "failed":
        return "bg-red-500";
      case "completed":
        return "bg-emerald-500";
      default:
        return "bg-muted-foreground/40";
    }
  })();

  const highlight =
    thread.latestJobStatus === "pending_approval"
      ? "ring-1 ring-amber-500/40"
      : thread.latestJobStatus === "running"
        ? "ring-1 ring-violet-500/30"
        : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${highlight} ${
        isActive
          ? "bg-primary/15 text-primary border border-primary/30 shadow-sm"
          : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent"
      }`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span>{truncate(thread.title, 25)}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            onDelete();
          }
        }}
        className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-xs"
      >
        ×
      </span>
    </button>
  );
}

function EditableTitle({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  if (!editing) {
    return (
      <h3
        className="text-base font-bold cursor-pointer hover:text-primary transition-colors"
        title="Click to rename"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
      >
        {title}
      </h3>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      className="text-base font-bold bg-transparent border-b border-primary outline-none w-full"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== title) {
          onSave(trimmed);
        }
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
    />
  );
}

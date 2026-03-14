import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import { ObservabilityDashboard } from "@/components/jobs/observability-dashboard";
import { RuntimeApprovalCards } from "@/components/jobs/runtime-approval-cards";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
  selectProject,
  stopJob,
} from "@/lib/api";
import type { Thread } from "@/lib/types";
import { rootRoute } from "@/routes/__root";

type JobsSearch = {
  project?: string;
  thread?: string;
};

export const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search): JobsSearch => ({
    project: typeof search.project === "string" && search.project.trim()
      ? search.project.trim()
      : undefined,
    thread: typeof search.thread === "string" && search.thread.trim()
      ? search.thread.trim()
      : undefined,
  }),
  component: JobsScreen,
});

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
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
  const navigate = jobsRoute.useNavigate();
  const search = jobsRoute.useSearch();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const projects = projectsQuery.data?.projects ?? [];
  const projectNames = new Set(projects.map((project) => project.name));
  const activeProjectFromSearch = search.project && projectNames.has(search.project)
    ? search.project
    : "";
  const activeProjectFromState = projectsQuery.data?.activeProject && projectNames.has(projectsQuery.data.activeProject)
    ? projectsQuery.data.activeProject
    : "";
  const activeProject = activeProjectFromSearch || activeProjectFromState || projects[0]?.name || "";

  const threadsQuery = useQuery({
    queryKey: ["threads", activeProject],
    queryFn: () => fetchThreads(activeProject),
    enabled: Boolean(activeProject),
    refetchInterval: 5000,
  });

  const threads = threadsQuery.data?.threads ?? [];
  const activeThread = threads.find((thread) => thread.id === search.thread) ?? threads[0] ?? null;

  const threadJobsQuery = useQuery({
    queryKey: ["threadJobs", activeThread?.id],
    queryFn: () => fetchThreadJobs(activeThread!.id),
    enabled: Boolean(activeThread?.id),
    refetchInterval: 3000,
  });

  const threadJobs = threadJobsQuery.data?.jobs ?? [];

  const observabilityQuery = useQuery({
    queryKey: ["observability"],
    queryFn: () => fetchObservability(),
    refetchInterval: 15_000,
  });

  const runtimeApprovalsQuery = useQuery({
    queryKey: ["runtimeApprovals"],
    queryFn: () => fetchRuntimeApprovals({ status: "pending", limit: 100 }),
    refetchInterval: 3000,
  });

  useEffect(() => {
    const nextProject = activeProject || undefined;
    const nextThread = activeThread?.id || undefined;
    const currentProject = search.project || undefined;
    const currentThread = search.thread || undefined;

    if (nextProject === currentProject && nextThread === currentThread) {
      return;
    }

    if (!nextProject && !currentProject && !nextThread && !currentThread) {
      return;
    }

    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        project: nextProject,
        thread: nextThread,
      }),
    });
  }, [activeProject, activeThread?.id, navigate, search.project, search.thread]);

  const selectProjectMutation = useMutation({
    mutationFn: (projectName: string) => selectProject({ projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: () => createThread({ projectName: activeProject }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
      void navigate({
        search: (previous) => ({
          ...previous,
          project: activeProject || undefined,
          thread: data.thread.id,
        }),
      });
    },
  });

  const createJobMutation = useMutation({
    mutationFn: (input: { task: string; projectName: string }) =>
      createJob({
        task: input.task,
        projectName: input.projectName,
        threadId: activeThread?.id || "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (jobId: string) => approveJob({ jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
    },
  });

  const denyMutation = useMutation({
    mutationFn: (jobId: string) => denyJob({ jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => resumeJobFromError({ jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (jobId: string) => stopJob({ jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
      queryClient.invalidateQueries({ queryKey: ["runtimeApprovals"] });
    },
  });

  const approveRuntimeMutation = useMutation({
    mutationFn: (id: string) => approveRuntimeApproval({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runtimeApprovals"] });
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
    },
  });

  const denyRuntimeMutation = useMutation({
    mutationFn: (id: string) => denyRuntimeApproval({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runtimeApprovals"] });
      queryClient.invalidateQueries({ queryKey: ["threadJobs", activeThread?.id] });
    },
  });

  const deleteThreadMutation = useMutation({
    mutationFn: (threadId: string) => deleteThread(threadId),
    onSuccess: (_, threadId) => {
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
      queryClient.removeQueries({ queryKey: ["threadJobs", threadId] });
      if (search.thread === threadId) {
        void navigate({
          search: (previous) => ({
            ...previous,
            thread: undefined,
          }),
        });
      }
    },
  });

  const renameThreadMutation = useMutation({
    mutationFn: (input: { threadId: string; title: string }) =>
      renameThread(input.threadId, input.title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads", activeProject] });
    },
  });

  const createJobErrorMessage = createJobMutation.isError
    ? readErrorMessage(
      createJobMutation.error,
      "Could not run task. Check backend logs and try again.",
    )
    : "";

  const threadTotalTokens = Number(activeThread?.tokenUsed || 0);
  const threadExactTokens = Number(activeThread?.tokenUsedExact || 0);
  const threadEstimatedTokens = Number(activeThread?.tokenUsedEstimated || 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="max-h-[34vh] shrink-0 space-y-4 overflow-y-auto pr-1 scrollbar-none">
        <ObservabilityDashboard summary={observabilityQuery.data ?? null} />

        <RuntimeApprovalCards
          approvals={runtimeApprovalsQuery.data?.approvals ?? []}
          approvingId={approveRuntimeMutation.variables ?? ""}
          denyingId={denyRuntimeMutation.variables ?? ""}
          onApprove={(id) => approveRuntimeMutation.mutate(id)}
          onDeny={(id) => denyRuntimeMutation.mutate(id)}
        />

        {projects.length > 0 && (
          <Card className="theme-surface animate-in border-border/50 shadow-sm fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Projects
                  </p>
                  <p className="text-sm text-foreground">
                    Choose a workspace before sending the next task.
                  </p>
                </div>
                {activeProject ? (
                  <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                    Active: {activeProject}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {projects.map((project) => (
                  <button
                    key={project.name}
                    type="button"
                    onClick={() => {
                      selectProjectMutation.mutate(project.name);
                      void navigate({
                        search: (previous) => ({
                          ...previous,
                          project: project.name,
                          thread: undefined,
                        }),
                      });
                    }}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                      project.name === activeProject
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "border border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeProject && (
          <Card className="theme-surface animate-in border-border/50 shadow-sm fade-in slide-in-from-bottom-4 duration-400 fill-mode-both">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Threads
                  </p>
                  <p className="text-sm text-foreground">
                    {threads.length > 0
                      ? "Switch conversations or start a new one."
                      : "Start the first thread for this project."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => createThreadMutation.mutate()}
                  disabled={createThreadMutation.isPending}
                  className="shrink-0 rounded-full border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-primary"
                >
                  + New Thread
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {threads.map((thread) => (
                  <ThreadPill
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThread?.id}
                    onClick={() => {
                      void navigate({
                        search: (previous) => ({
                          ...previous,
                          project: activeProject,
                          thread: thread.id,
                        }),
                      });
                    }}
                    onDelete={async () => {
                      const confirmed = await confirm({
                        title: `Delete "${thread.title}"?`,
                        description:
                          "This permanently removes the thread and its Codex resume session from disk.",
                        confirmLabel: "Delete",
                        variant: "destructive",
                      });
                      if (confirmed) {
                        deleteThreadMutation.mutate(thread.id);
                      }
                    }}
                  />
                ))}

                {threads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No threads yet for this project.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="min-h-0 flex flex-1 flex-col gap-4">
        {activeThread ? (
          <Card className="theme-surface animate-in relative flex min-h-0 flex-1 flex-col overflow-hidden border-border/50 shadow-md fade-in slide-in-from-bottom-6 duration-500 fill-mode-both">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <CardHeader className="shrink-0 border-b border-border/30 pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
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
                    {activeProject} | {threadJobs.length} message
                    {threadJobs.length !== 1 ? "s" : ""} | tokens burned {threadTotalTokens}
                  </CardDescription>
                </div>

                <div className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-left shadow-sm sm:min-w-[13rem] sm:text-right">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Thread tokens
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {threadTotalTokens}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Exact {threadExactTokens} / est {threadEstimatedTokens}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="min-h-0 flex-1 p-3 sm:p-4">
              <JobChatFeed
                className="h-full"
                threadId={activeThread.id}
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
            className="theme-surface flex flex-1 cursor-pointer items-center justify-center transition-all hover:border-primary/30 hover:shadow-md"
            onClick={() => {
              if (activeProject) {
                createThreadMutation.mutate();
              }
            }}
          >
            <CardContent className="px-6 py-14 text-center">
              <p className="text-base font-semibold text-foreground">
                {!activeProject ? "Select a project to start chatting." : "No thread selected."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {!activeProject
                  ? "Choose a project above or add one in Settings."
                  : "Create a new thread to keep the composer docked and ready at the bottom."}
              </p>
            </CardContent>
          </Card>
        )}

        {activeThread && (
          <div className="shrink-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-75 fill-mode-both">
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
      </div>

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
    <div
      className={`group flex shrink-0 items-center gap-1 rounded-full border transition-all ${highlight} ${
        isActive
          ? "border-primary/30 bg-primary/15 text-primary shadow-sm"
          : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 items-center gap-2 px-4 py-2 text-xs font-medium"
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span>{truncate(thread.title, 25)}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-full px-2 py-2 text-xs opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete ${thread.title}`}
      >
        x
      </button>
    </div>
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
        className="cursor-pointer text-base font-bold transition-colors hover:text-primary"
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
      className="w-full border-b border-primary bg-transparent text-base font-bold outline-none"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== title) {
          onSave(trimmed);
        }
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
    />
  );
}

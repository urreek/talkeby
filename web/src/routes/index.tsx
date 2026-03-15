import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import {
  MobileWorkspaceBar,
  WorkspaceControls,
} from "@/components/jobs/workspace-controls";
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
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const [mobileComposerHeight, setMobileComposerHeight] = useState(0);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);

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

  const runtimeApprovals = runtimeApprovalsQuery.data?.approvals ?? [];
  const pendingRuntimeApprovalCount = runtimeApprovals.length;
  const threadTotalTokens = Number(activeThread?.tokenUsed || 0);
  const threadExactTokens = Number(activeThread?.tokenUsedExact || 0);
  const threadEstimatedTokens = Number(activeThread?.tokenUsedEstimated || 0);
  const jobsScreenStyle = {
    "--talkeby-mobile-composer-space":
      activeThread && mobileComposerHeight > 0
        ? `calc(${mobileComposerHeight}px + var(--talkeby-bottom-clearance) + 1rem)`
        : "0px",
  } as CSSProperties;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const container = composerContainerRef.current;
    if (!container) {
      return;
    }

    const mobileMedia = window.matchMedia("(max-width: 639px)");
    let resizeObserver: ResizeObserver | null = null;

    const updateHeight = () => {
      if (!activeThread || !mobileMedia.matches) {
        setMobileComposerHeight(0);
        return;
      }

      const nextHeight = Math.ceil(container.getBoundingClientRect().height);
      setMobileComposerHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    updateHeight();

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(container);
    }

    if (typeof mobileMedia.addEventListener === "function") {
      mobileMedia.addEventListener("change", updateHeight);
    } else {
      mobileMedia.addListener(updateHeight);
    }
    window.addEventListener("resize", updateHeight);

    return () => {
      resizeObserver?.disconnect();
      if (typeof mobileMedia.removeEventListener === "function") {
        mobileMedia.removeEventListener("change", updateHeight);
      } else {
        mobileMedia.removeListener(updateHeight);
      }
      window.removeEventListener("resize", updateHeight);
    };
  }, [activeThread?.id]);

  useEffect(() => {
    if (!activeProject || !activeThread) {
      setMobileWorkspaceOpen(true);
    }
  }, [activeProject, activeThread]);

  const handleSelectProject = (projectName: string) => {
    selectProjectMutation.mutate(projectName);
    setMobileWorkspaceOpen(false);
    void navigate({
      search: (previous) => ({
        ...previous,
        project: projectName,
        thread: undefined,
      }),
    });
  };

  const handleCreateThread = () => {
    if (!activeProject) {
      return;
    }
    setMobileWorkspaceOpen(false);
    createThreadMutation.mutate();
  };

  const handleSelectThread = (threadId: string) => {
    setMobileWorkspaceOpen(false);
    void navigate({
      search: (previous) => ({
        ...previous,
        project: activeProject,
        thread: threadId,
      }),
    });
  };

  const handleDeleteThread = async (thread: Thread) => {
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
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" style={jobsScreenStyle}>
      <div className="space-y-3 sm:hidden">
        <MobileWorkspaceBar
          activeProject={activeProject}
          activeThread={activeThread}
          messageCount={threadJobs.length}
          pendingApprovalCount={pendingRuntimeApprovalCount}
          workspaceOpen={mobileWorkspaceOpen}
          creatingThread={createThreadMutation.isPending}
          onToggleWorkspace={() => setMobileWorkspaceOpen((current) => !current)}
          onCreateThread={handleCreateThread}
        />

        {mobileWorkspaceOpen && (
          <div className="max-h-[42vh] space-y-4 overflow-y-auto pr-1 scrollbar-none">
            <WorkspaceControls
              projects={projects}
              activeProject={activeProject}
              threads={threads}
              activeThreadId={activeThread?.id}
              observabilitySummary={observabilityQuery.data ?? null}
              runtimeApprovals={runtimeApprovals}
              approvingRuntimeId={approveRuntimeMutation.variables ?? ""}
              denyingRuntimeId={denyRuntimeMutation.variables ?? ""}
              creatingThread={createThreadMutation.isPending}
              onApproveRuntime={(id) => approveRuntimeMutation.mutate(id)}
              onDenyRuntime={(id) => denyRuntimeMutation.mutate(id)}
              onSelectProject={handleSelectProject}
              onCreateThread={handleCreateThread}
              onSelectThread={handleSelectThread}
              onDeleteThread={(thread) => {
                void handleDeleteThread(thread);
              }}
            />
          </div>
        )}
      </div>

      <div className="hidden max-h-[34vh] shrink-0 space-y-4 overflow-y-auto pr-1 scrollbar-none sm:block">
        <WorkspaceControls
          projects={projects}
          activeProject={activeProject}
          threads={threads}
          activeThreadId={activeThread?.id}
          observabilitySummary={observabilityQuery.data ?? null}
          runtimeApprovals={runtimeApprovals}
          approvingRuntimeId={approveRuntimeMutation.variables ?? ""}
          denyingRuntimeId={denyRuntimeMutation.variables ?? ""}
          creatingThread={createThreadMutation.isPending}
          onApproveRuntime={(id) => approveRuntimeMutation.mutate(id)}
          onDenyRuntime={(id) => denyRuntimeMutation.mutate(id)}
          onSelectProject={handleSelectProject}
          onCreateThread={handleCreateThread}
          onSelectThread={handleSelectThread}
          onDeleteThread={(thread) => {
            void handleDeleteThread(thread);
          }}
        />
      </div>

      <div className="min-h-0 flex flex-1 flex-col gap-4 pb-[var(--talkeby-mobile-composer-space)] sm:pb-0">
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
          <div
            ref={composerContainerRef}
            className="fixed inset-x-0 bottom-[calc(var(--talkeby-bottom-clearance)+0.75rem)] z-30 mx-auto w-full max-w-xl shrink-0 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-75 fill-mode-both sm:static sm:mx-0 sm:max-w-none sm:px-0"
          >
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

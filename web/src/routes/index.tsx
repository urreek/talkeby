import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import { RuntimeApprovalCards } from "@/components/jobs/runtime-approval-cards";
import {
  WorkspaceDesktopSidebar,
  WorkspaceDrawer,
  WorkspaceToolbar,
} from "@/components/jobs/workspace-drawer";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  approveJob,
  approveRuntimeApproval,
  createJob,
  createThread,
  deleteThread,
  denyJob,
  denyRuntimeApproval,
  setProvider,
  fetchProjects,
  fetchRuntimeApprovals,
  fetchThreadJobs,
  fetchThreads,
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

function threadStatusRank(status: string | null) {
  switch (status) {
    case "running":
      return 0;
    case "pending_approval":
      return 1;
    case "queued":
      return 2;
    default:
      return 3;
  }
}

function threadTimestamp(thread: Thread) {
  const parsedUpdated = Date.parse(String(thread.updatedAt || ""));
  if (!Number.isNaN(parsedUpdated)) {
    return parsedUpdated;
  }
  const parsedCreated = Date.parse(String(thread.createdAt || ""));
  if (!Number.isNaN(parsedCreated)) {
    return parsedCreated;
  }
  return 0;
}

function sortThreadsByPriority(threads: Thread[]) {
  return [...threads].sort((left, right) => {
    const statusDelta = threadStatusRank(left.latestJobStatus) - threadStatusRank(right.latestJobStatus);
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return threadTimestamp(right) - threadTimestamp(left);
  });
}

function JobsScreen() {
  const navigate = jobsRoute.useNavigate();
  const search = jobsRoute.useSearch();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);

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

  const threads = sortThreadsByPriority(threadsQuery.data?.threads ?? []);
  const activeThread = threads.find((thread) => thread.id === search.thread) ?? threads[0] ?? null;

  const threadJobsQuery = useQuery({
    queryKey: ["threadJobs", activeThread?.id],
    queryFn: () => fetchThreadJobs(activeThread!.id),
    enabled: Boolean(activeThread?.id),
    refetchInterval: 3000,
  });

  const threadJobs = threadJobsQuery.data?.jobs ?? [];

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
      setWorkspaceDrawerOpen(false);
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

  const createJobErrorMessage = createJobMutation.isError
    ? readErrorMessage(
      createJobMutation.error,
      "Could not run task. Check backend logs and try again.",
    )
    : "";

  const runtimeApprovals = runtimeApprovalsQuery.data?.approvals ?? [];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOpenWorkspaceDrawer = () => {
      setWorkspaceDrawerOpen(true);
    };

    window.addEventListener("talkeby:open-workspace-drawer", handleOpenWorkspaceDrawer);
    return () => {
      window.removeEventListener("talkeby:open-workspace-drawer", handleOpenWorkspaceDrawer);
    };
  }, []);
  useEffect(() => {
    if (!activeProject || !activeThread) {
      setWorkspaceDrawerOpen(true);
    }
  }, [activeProject, activeThread?.id]);

  useEffect(() => {
    if (!activeThread?.id) {
      return;
    }

    let cancelled = false;
    void setProvider({ threadId: activeThread.id }).then((response) => {
      if (!cancelled) {
        queryClient.setQueryData(["provider"], response);
      }
    }).catch(() => {
      // The provider query surfaces API errors elsewhere.
    });

    return () => {
      cancelled = true;
    };
  }, [activeThread?.id, queryClient]);

  const handleSelectProject = (projectName: string) => {
    selectProjectMutation.mutate(projectName);
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
      setWorkspaceDrawerOpen(true);
      return;
    }

    createThreadMutation.mutate();
  };

  const handleSelectThread = (threadId: string) => {
    setWorkspaceDrawerOpen(false);
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
    <div className="relative flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:gap-5 xl:gap-6">
      <WorkspaceDrawer
        open={workspaceDrawerOpen}
        activeProject={activeProject}
        activeThread={activeThread}
        projects={projects}
        threads={threads}
        creatingThread={createThreadMutation.isPending}
        onOpenChange={setWorkspaceDrawerOpen}
        onSelectProject={handleSelectProject}
        onCreateThread={handleCreateThread}
        onSelectThread={handleSelectThread}
        onDeleteThread={(thread) => {
          void handleDeleteThread(thread);
        }}
      />

      <WorkspaceDesktopSidebar
        activeProject={activeProject}
        activeThread={activeThread}
        projects={projects}
        threads={threads}
        creatingThread={createThreadMutation.isPending}
        onSelectProject={handleSelectProject}
        onCreateThread={handleCreateThread}
        onSelectThread={handleSelectThread}
        onDeleteThread={(thread) => {
          void handleDeleteThread(thread);
        }}
      />

      <div className="min-h-0 flex flex-1 flex-col gap-3 lg:gap-4">
        <WorkspaceToolbar
          activeProject={activeProject}
          activeThread={activeThread}
        />

        {runtimeApprovals.length > 0 ? (
          <div className="order-2 space-y-4 lg:order-1">
            <RuntimeApprovalCards
              approvals={runtimeApprovals}
              approvingId={approveRuntimeMutation.variables ?? ""}
              denyingId={denyRuntimeMutation.variables ?? ""}
              onApprove={(id) => approveRuntimeMutation.mutate(id)}
              onDeny={(id) => denyRuntimeMutation.mutate(id)}
            />
          </div>
        ) : null}

        <div className="order-1 min-h-0 flex flex-1 flex-col lg:order-2">
          {activeThread ? (
            <Card className="theme-surface relative flex h-full min-h-0 flex-1 flex-col overflow-hidden border-border/50 shadow-md">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="min-h-0 flex-1 px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5">
                  <JobChatFeed
                    className="h-full pb-4"
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
                </div>

                <div className="shrink-0 border-t border-border/40 bg-card/70 px-3 pb-[var(--talkeby-bottom-clearance)] pt-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/35 sm:px-4 sm:pt-4 lg:px-5 lg:pb-5 lg:pt-5">
                  <CreateJobForm
                    projects={projects}
                    activeProject={activeProject}
                    activeThreadId={activeThread.id}
                    isSubmitting={createJobMutation.isPending}
                    submitError={createJobErrorMessage}
                    variant="embedded"
                    onSubmit={async (input) => {
                      createJobMutation.reset();
                      await createJobMutation.mutateAsync(input);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="theme-surface flex flex-1 items-center justify-center border-border/50 shadow-md">
              <CardContent className="max-w-md px-6 py-14 text-center">
                <p className="text-lg font-semibold text-foreground">
                  {!activeProject ? "Choose a project to start." : "Pick a thread to continue."}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {!activeProject
                    ? "Open the workspace drawer to choose a project, then start a thread when you are ready."
                    : "Your workspace is ready. Select a thread from the drawer or create a fresh conversation."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button type="button" onClick={() => setWorkspaceDrawerOpen(true)}>
                    Open Workspace
                  </Button>
                  {activeProject ? (
                    <Button type="button" variant="outline" onClick={handleCreateThread}>
                      {createThreadMutation.isPending ? "Creating..." : "New Thread"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {ConfirmDialog}
    </div>
  );
}








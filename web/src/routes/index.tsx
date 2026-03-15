import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import { ObservabilityDashboard } from "@/components/jobs/observability-dashboard";
import { RuntimeApprovalCards } from "@/components/jobs/runtime-approval-cards";
import {
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
import { cn } from "@/lib/utils";
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
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [chatHidden, setChatHidden] = useState(false);
  const [compactChat, setCompactChat] = useState(false);

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

  useEffect(() => {
    if (!activeProject || !activeThread) {
      setWorkspaceDrawerOpen(true);
    }
  }, [activeProject, activeThread?.id]);

  useEffect(() => {
    if (!activeThread) {
      setChatHidden(false);
      setCompactChat(false);
    }
  }, [activeThread?.id]);

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
    <div className="relative flex min-h-0 flex-1 flex-col gap-4">
      <WorkspaceDrawer
        open={workspaceDrawerOpen}
        activeProject={activeProject}
        activeThread={activeThread}
        projects={projects}
        threads={threads}
        pendingApprovalCount={pendingRuntimeApprovalCount}
        creatingThread={createThreadMutation.isPending}
        onOpenChange={setWorkspaceDrawerOpen}
        onSelectProject={handleSelectProject}
        onCreateThread={handleCreateThread}
        onSelectThread={handleSelectThread}
        onDeleteThread={(thread) => {
          void handleDeleteThread(thread);
        }}
      />

      <div className="shrink-0 space-y-4">
        <WorkspaceToolbar
          activeProject={activeProject}
          activeThread={activeThread}
          messageCount={threadJobs.length}
          pendingApprovalCount={pendingRuntimeApprovalCount}
          drawerOpen={workspaceDrawerOpen}
          creatingThread={createThreadMutation.isPending}
          chatHidden={chatHidden}
          compactChat={compactChat}
          onToggleDrawer={() => setWorkspaceDrawerOpen((current) => !current)}
          onCreateThread={handleCreateThread}
          onToggleChatVisibility={() => setChatHidden((current) => !current)}
          onToggleChatSize={() => setCompactChat((current) => !current)}
        />

        <RuntimeApprovalCards
          approvals={runtimeApprovals}
          approvingId={approveRuntimeMutation.variables ?? ""}
          denyingId={denyRuntimeMutation.variables ?? ""}
          onApprove={(id) => approveRuntimeMutation.mutate(id)}
          onDeny={(id) => denyRuntimeMutation.mutate(id)}
        />

        <ObservabilityDashboard summary={observabilityQuery.data ?? null} />
      </div>

      <div
        className={cn(
          "min-h-0 flex flex-1 flex-col gap-4",
          workspaceDrawerOpen && "pointer-events-none select-none",
        )}
        aria-hidden={workspaceDrawerOpen}
      >
        {activeThread ? (
          chatHidden ? (
            <Card className="theme-surface animate-in flex flex-1 items-center border-border/50 shadow-md fade-in slide-in-from-bottom-6 duration-500 fill-mode-both">
              <CardContent className="w-full space-y-3 p-6 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Chat is hidden.
                </p>
                <p className="text-xs text-muted-foreground">
                  Open the drawer to switch projects or threads while chat stays collapsed.
                </p>
                <div className="flex justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setChatHidden(false)}
                  >
                    Show Chat
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card
              className={cn(
                "theme-surface animate-in relative flex min-h-0 flex-col overflow-hidden border-border/50 shadow-md fade-in slide-in-from-bottom-6 duration-500 fill-mode-both",
                compactChat ? "h-[42vh] sm:h-auto sm:flex-1" : "flex-1",
              )}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
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
          )
        ) : (
          <Card
            className="theme-surface flex flex-1 cursor-pointer items-center justify-center transition-all hover:border-primary/30 hover:shadow-md"
            onClick={() => {
              if (activeProject) {
                createThreadMutation.mutate();
                return;
              }

              setWorkspaceDrawerOpen(true);
            }}
          >
            <CardContent className="px-6 py-14 text-center">
              <p className="text-base font-semibold text-foreground">
                {!activeProject ? "Select a project to start chatting." : "No thread selected."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {!activeProject
                  ? "Open the drawer and pick a project, or add one in Settings."
                  : "Open the drawer or create a new thread to keep the composer docked and ready at the bottom."}
              </p>
            </CardContent>
          </Card>
        )}

        {activeThread && !chatHidden && !workspaceDrawerOpen && (
          <div
            className="shrink-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-75 fill-mode-both"
          >
            <CreateJobForm
              projects={projects}
              activeProject={activeProject}
              threadTitle={activeThread.title}
              threadTokenCount={threadTotalTokens}
              isSubmitting={createJobMutation.isPending}
              submitError={createJobErrorMessage}
              onRenameThread={(title) =>
                renameThreadMutation.mutate({
                  threadId: activeThread.id,
                  title,
                })
              }
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

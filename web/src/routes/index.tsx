import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobCard } from "@/components/jobs/job-card";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import { PendingApprovals } from "@/components/jobs/pending-approvals";
import { ProjectSelector } from "@/components/jobs/project-selector";
import { StatusOverview } from "@/components/jobs/status-overview";
import { useJobsScreenData } from "@/components/jobs/use-jobs-screen-data";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchProvider } from "@/lib/api";
import { getStoredChatId, setStoredChatId } from "@/lib/storage";
import { rootRoute } from "@/routes/__root";

const PROVIDER_LABELS: Record<string, string> = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  gemini: "Gemini CLI",
};

export const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: JobsScreen,
});

function JobsScreen() {
  const [chatId, setChatId] = useState(() => getStoredChatId());
  const [draftChatId, setDraftChatId] = useState(chatId);

  const {
    jobs,
    latestJob,
    pendingJobs,
    currentMode,
    activeProject,
    availableProjects,
    createMutation,
    approveMutation,
    denyMutation,
    selectProjectMutation,
    errorMessage,
  } = useJobsScreenData(chatId);

  if (!chatId) {
    return (
      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Connect Chat ID</CardTitle>
          <CardDescription>
            This UI maps to your Telegram chat identity for mode/project/job
            ownership.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="Paste your Telegram chat ID"
            value={draftChatId}
            className="bg-background"
            onChange={(event) => setDraftChatId(event.target.value)}
          />
          <Button
            className="w-full"
            onClick={() => {
              const next = draftChatId.trim();
              if (!next) {
                return;
              }
              setStoredChatId(next);
              setChatId(next);
            }}
          >
            Save and Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasActiveProject = activeProject.length > 0;

  return (
    <div className="space-y-6">
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both">
        <ProjectSelector
          activeProject={activeProject}
          projects={availableProjects}
          isUpdating={selectProjectMutation.isPending}
          onChangeProject={(name) => selectProjectMutation.mutate(name)}
        />
      </div>

      <ActiveProviderBadge />

      {!hasActiveProject && (
        <Card className="theme-surface animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-lg font-semibold text-foreground">
              {availableProjects.length === 0
                ? "No projects yet"
                : "No project selected"}
            </p>
            <p className="text-sm text-muted-foreground">
              {availableProjects.length === 0
                ? "Go to Settings to add your first project, then come back here to start coding."
                : "Select a project above to see jobs and start coding."}
            </p>
          </CardContent>
        </Card>
      )}

      {hasActiveProject && (
        <>
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
            <StatusOverview mode={currentMode} job={latestJob} />
          </div>

          {errorMessage ? (
            <Card className="animate-in fade-in border-destructive/40 bg-destructive/10 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-destructive">
                  {errorMessage}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-75 fill-mode-both">
            <PendingApprovals
              jobs={pendingJobs}
              approvingJobId={approveMutation.variables ?? ""}
              denyingJobId={denyMutation.variables ?? ""}
              onApprove={(jobId) => approveMutation.mutate(jobId)}
              onDeny={(jobId) => denyMutation.mutate(jobId)}
            />
          </div>

          <section className="space-y-4 animate-in fade-in slide-in-from-bottom-12 duration-700 delay-150 fill-mode-both">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </section>

          <div className="animate-in fade-in slide-in-from-bottom-16 duration-700 delay-200 fill-mode-both">
            <Card className="theme-surface relative overflow-hidden border-border/50 shadow-md">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold">Chat</CardTitle>
                <CardDescription className="text-muted-foreground/80">
                  Messages between you and agent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <JobChatFeed jobs={jobs} />
              </CardContent>
            </Card>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-24 duration-700 delay-300 fill-mode-both">
            <CreateJobForm
              projects={availableProjects}
              activeProject={activeProject}
              isSubmitting={createMutation.isPending}
              onSubmit={async (input) => {
                await createMutation.mutateAsync(input);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ActiveProviderBadge() {
  const providerQuery = useQuery({
    queryKey: ["provider"],
    queryFn: fetchProvider,
  });

  const data = providerQuery.data;
  if (!data) {
    return null;
  }

  const label = PROVIDER_LABELS[data.provider] ?? data.provider;
  const parts = [label];
  if (data.model) {
    parts.push(data.model);
  }
  if (data.reasoningEffort) {
    parts.push(data.reasoningEffort);
  }
  if (data.planMode) {
    parts.push("plan");
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-300">
      <span className="inline-block h-2 w-2 rounded-full bg-primary/60" />
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

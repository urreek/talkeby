import { useState } from "react";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobCard } from "@/components/jobs/job-card";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
import { PendingApprovals } from "@/components/jobs/pending-approvals";
import { StatusOverview } from "@/components/jobs/status-overview";
import { useJobsScreenData } from "@/components/jobs/use-jobs-screen-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getStoredChatId, setStoredChatId } from "@/lib/storage";
import { rootRoute } from "@/routes/__root";

export const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: JobsScreen
});

function JobsScreen() {
  const [chatId, setChatId] = useState(() => getStoredChatId());
  const [draftChatId, setDraftChatId] = useState(chatId);

  const {
    jobs,
    pendingJobs,
    currentMode,
    activeProject,
    availableProjects,
    createMutation,
    approveMutation,
    denyMutation,
    errorMessage
  } = useJobsScreenData(chatId);

  if (!chatId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Chat ID</CardTitle>
          <CardDescription>
            This UI maps to your Telegram chat identity for mode/project/job ownership.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Paste your Telegram chat ID"
            value={draftChatId}
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

  return (
    <div className="space-y-4">
      <StatusOverview mode={currentMode} job={jobs[0]} />

      {errorMessage ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent>
            <p className="text-sm text-destructive">{errorMessage}</p>
          </CardContent>
        </Card>
      ) : null}

      <CreateJobForm
        projects={availableProjects}
        activeProject={activeProject}
        isSubmitting={createMutation.isPending}
        onSubmit={async (input) => {
          await createMutation.mutateAsync(input);
        }}
      />

      <PendingApprovals
        jobs={pendingJobs}
        approvingJobId={approveMutation.variables ?? ""}
        denyingJobId={denyMutation.variables ?? ""}
        onApprove={(jobId) => approveMutation.mutate(jobId)}
        onDeny={(jobId) => denyMutation.mutate(jobId)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Chat</CardTitle>
          <CardDescription>Messages between you and Talkeby.</CardDescription>
        </CardHeader>
        <CardContent>
          <JobChatFeed jobs={jobs} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </section>
    </div>
  );
}

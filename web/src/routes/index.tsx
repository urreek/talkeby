import { useState } from "react";
import { createRoute } from "@tanstack/react-router";

import { CreateJobForm } from "@/components/jobs/create-job-form";
import { JobChatFeed } from "@/components/jobs/job-chat-feed";
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
import { getStoredChatId, setStoredChatId } from "@/lib/storage";
import { rootRoute } from "@/routes/__root";

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
    createMutation,
    approveMutation,
    denyMutation,
    activeProject,
    availableProjects,
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

  return (
    <div className="space-y-6">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
        <CreateJobForm
          projects={availableProjects}
          activeProject={activeProject}
          isSubmitting={createMutation.isPending}
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input);
          }}
        />
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
        <JobChatFeed
          jobs={jobs}
          approvingJobId={approveMutation.variables ?? ""}
          denyingJobId={denyMutation.variables ?? ""}
          onApprove={(jobId) => approveMutation.mutate(jobId)}
          onDeny={(jobId) => denyMutation.mutate(jobId)}
        />
      </div>
    </div>
  );
}

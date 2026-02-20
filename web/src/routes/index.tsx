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
import type { Job } from "@/lib/types";
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

function statusDot(status: string) {
  switch (status) {
    case "running":
      return "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.5)]";
    case "completed":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    case "pending_approval":
      return "bg-amber-500 animate-pulse";
    case "denied":
      return "bg-neutral-400";
    default:
      return "bg-muted-foreground/50";
  }
}

function JobsScreen() {
  const [chatId, setChatId] = useState(() => getStoredChatId());
  const [draftChatId, setDraftChatId] = useState(chatId);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const {
    jobs,
    createMutation,
    approveMutation,
    denyMutation,
    activeProject,
    availableProjects,
    errorMessage,
  } = useJobsScreenData(chatId);

  // Auto-select the latest job if nothing is selected
  const orderedJobs = jobs.slice(0, 30);
  const selectedJob =
    orderedJobs.find((j) => j.id === selectedJobId) ?? orderedJobs[0] ?? null;

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
    <div className="space-y-4">
      {/* Thread selector */}
      {orderedJobs.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both">
          <ThreadSelector
            jobs={orderedJobs}
            selectedJobId={selectedJob?.id ?? null}
            onSelect={setSelectedJobId}
          />
        </div>
      )}

      {/* Chat feed for selected thread */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
        {selectedJob ? (
          <JobChatFeed
            jobs={[selectedJob]}
            approvingJobId={approveMutation.variables ?? ""}
            denyingJobId={denyMutation.variables ?? ""}
            onApprove={(jobId) => approveMutation.mutate(jobId)}
            onDeny={(jobId) => denyMutation.mutate(jobId)}
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            No threads yet. Send a task below to start.
          </p>
        )}
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

      {/* New Task composer at bottom */}
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-75 fill-mode-both">
        <CreateJobForm
          projects={availableProjects}
          activeProject={activeProject}
          isSubmitting={createMutation.isPending}
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input);
          }}
        />
      </div>
    </div>
  );
}

function ThreadSelector({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: Job[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {jobs.map((job) => {
        const isActive = job.id === selectedJobId;
        return (
          <button
            key={job.id}
            type="button"
            onClick={() => onSelect(job.id)}
            className={`flex items-center gap-2 shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${statusDot(job.status)}`}
            />
            <span>{truncate(job.request, 30)}</span>
          </button>
        );
      })}
    </div>
  );
}

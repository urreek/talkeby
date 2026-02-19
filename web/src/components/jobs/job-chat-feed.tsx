import type { Job } from "@/lib/types";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString();
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
  if (job.status === "pending_approval") {
    return "I need your approval before continuing this task.";
  }
  if (job.status === "running") {
    return "Working on it now. I will post the result here when done.";
  }
  return "Queued. I will start this shortly and keep you updated.";
}

export function JobChatFeed({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No messages yet. Send a task and Talkeby will respond here.
      </p>
    );
  }

  const ordered = jobs.slice(0, 20).reverse();

  return (
    <section className="space-y-3">
      {ordered.map((job) => (
        <div key={job.id} className="space-y-2">
          <div className="ml-8 rounded-2xl bg-white p-3 shadow-soft">
            <p className="text-xs text-muted-foreground">You · {formatTimestamp(job.createdAt)}</p>
            <p className="mt-1 text-sm text-foreground">{job.request}</p>
          </div>
          <div className="mr-8 rounded-2xl bg-primary/10 p-3">
            <p className="text-xs text-muted-foreground">Talkeby · {job.projectName}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{assistantMessage(job)}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

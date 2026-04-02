import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getJobDisplayRequest } from "@/lib/job-display";
import type { Job } from "@/lib/types";

type PendingApprovalsProps = {
  jobs: Job[];
  approvingJobId: string;
  denyingJobId: string;
  onApprove: (jobId: string) => void;
  onDeny: (jobId: string) => void;
};

export function PendingApprovals({
  jobs,
  approvingJobId,
  denyingJobId,
  onApprove,
  onDeny,
}: PendingApprovalsProps) {
  if (jobs.length === 0) {
    return null;
  }

  return (
    <Card className="theme-surface">
      <CardHeader>
        <CardTitle>Pending Approval</CardTitle>
        <CardDescription>Interactive mode jobs wait here until you approve.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.map((job, index) => {
            const request = getJobDisplayRequest(job);

            return (
              <div key={job.id} className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{job.id}</p>
                  <p className="text-xs text-muted-foreground">Action: Run this Codex task on your home machine</p>
                  <p className="text-sm text-foreground">{request}</p>
                  <p className="text-xs text-muted-foreground">{job.projectName} · {job.workdir}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => {
                      const ok = window.confirm(
                        [
                          "Approve this request?",
                          `Job: ${job.id}`,
                          `Project: ${job.projectName}`,
                          `Request: ${request}`,
                        ].join("\n"),
                      );
                      if (ok) {
                        onApprove(job.id);
                      }
                    }}
                    disabled={approvingJobId === job.id || denyingJobId === job.id}
                  >
                    {approvingJobId === job.id ? "Approving..." : "Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-background hover:bg-secondary"
                    onClick={() => {
                      const ok = window.confirm(
                        [
                          "Deny this request?",
                          `Job: ${job.id}`,
                          `Project: ${job.projectName}`,
                          `Request: ${request}`,
                        ].join("\n"),
                      );
                      if (ok) {
                        onDeny(job.id);
                      }
                    }}
                    disabled={approvingJobId === job.id || denyingJobId === job.id}
                  >
                    {denyingJobId === job.id ? "Denying..." : "Deny"}
                  </Button>
                </div>
                {index < jobs.length - 1 ? <Separator /> : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

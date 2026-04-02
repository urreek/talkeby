import type { Job } from "@/lib/types";

export function getJobDisplayRequest(job: Job): string {
  return job.displayRequest?.trim() || job.request;
}

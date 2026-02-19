import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/types";

const variantByStatus: Record<JobStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pending_approval: "warning",
  queued: "secondary",
  running: "default",
  completed: "success",
  failed: "destructive",
  denied: "destructive"
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const label = status.replace(/_/g, " ");
  return <Badge variant={variantByStatus[status]}>{label}</Badge>;
}

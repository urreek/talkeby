import type { QueryClient } from "@tanstack/react-query";
import type { Thread, ThreadsResponse } from "@/lib/types";

function creationTimestamp(thread: Thread) {
  const created = Date.parse(thread.createdAt);
  if (Number.isFinite(created)) return created;
  const updated = Date.parse(thread.updatedAt);
  return Number.isFinite(updated) ? updated : 0;
}

export function sortThreadsNewestFirst(threads: Thread[]) {
  return [...threads].sort((left, right) => creationTimestamp(right) - creationTimestamp(left));
}

export async function selectCreatedThread({
  queryClient,
  thread,
  onSelect,
}: {
  queryClient: QueryClient;
  thread: Thread;
  onSelect: (thread: Thread) => Promise<unknown>;
}) {
  const queryKey = ["threads", thread.projectName];
  // Cancel an older list response before inserting the created chat and navigating.
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<ThreadsResponse>(queryKey, (previous) => ({
    ...previous,
    threads: [
      { ...thread, latestJobStatus: thread.latestJobStatus ?? null },
      ...(previous?.threads ?? []).filter((item) => item.id !== thread.id),
    ],
  }));
  await onSelect(thread);
  await queryClient.invalidateQueries({ queryKey, exact: true });
}

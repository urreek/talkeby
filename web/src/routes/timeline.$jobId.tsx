import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createRoute } from "@tanstack/react-router";

import { JobTimeline } from "@/components/timeline/job-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJob, fetchJobEvents } from "@/lib/api";
import { subscribeJobEvents } from "@/lib/events";
import type { JobEvent } from "@/lib/types";
import { rootRoute } from "@/routes/__root";

export const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/timeline/$jobId",
  component: TimelineScreen,
});

function TimelineScreen() {
  const queryClient = useQueryClient();
  const { jobId } = timelineRoute.useParams();

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
  });

  const eventsQuery = useQuery({
    queryKey: ["job-events", jobId],
    queryFn: () => fetchJobEvents(jobId),
  });

  const events = eventsQuery.data ?? [];
  const lastEventId = useMemo(() => events.at(-1)?.id ?? 0, [events]);

  useEffect(() => {
    return subscribeJobEvents({
      jobId,
      afterEventId: lastEventId,
      onEvent: (event) => {
        queryClient.setQueryData<JobEvent[]>(["job-events", jobId], (current) => {
          const list = current ?? [];
          if (list.some((item) => item.id === event.id)) {
            return list;
          }
          return [...list, event];
        });
        queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      },
    });
  }, [jobId, lastEventId, queryClient]);

  const backSearch = jobQuery.data
    ? {
      project: jobQuery.data.projectName,
      thread: jobQuery.data.threadId || undefined,
    }
    : undefined;

  return (
    <div className="space-y-4">
      <Card className="theme-surface">
        <CardHeader>
          <CardTitle className="font-mono text-sm">{jobId}</CardTitle>
          <CardDescription>{jobQuery.data?.projectName ?? "Project"}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">{jobQuery.data?.request ?? "Loading..."}</p>
          <Link
            to="/"
            search={backSearch}
            className="mt-3 inline-flex text-sm font-semibold text-primary"
          >
            Back to Jobs
          </Link>
        </CardContent>
      </Card>

      <JobTimeline events={events} />
    </div>
  );
}

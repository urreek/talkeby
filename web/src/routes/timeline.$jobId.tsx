import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createRoute } from "@tanstack/react-router";

import { JobTimeline } from "@/components/timeline/job-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJob, fetchJobEvents } from "@/lib/api";
import { subscribeJobEvents } from "@/lib/events";
import { getStoredChatId } from "@/lib/storage";
import type { JobEvent } from "@/lib/types";
import { rootRoute } from "@/routes/__root";

export const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/timeline/$jobId",
  component: TimelineScreen
});

function TimelineScreen() {
  const queryClient = useQueryClient();
  const { jobId } = timelineRoute.useParams();
  const chatId = getStoredChatId();

  const jobQuery = useQuery({
    queryKey: ["job", jobId, chatId],
    queryFn: () => fetchJob(jobId, chatId),
    enabled: Boolean(chatId)
  });

  const eventsQuery = useQuery({
    queryKey: ["job-events", jobId, chatId],
    queryFn: () => fetchJobEvents(jobId, chatId),
    enabled: Boolean(chatId)
  });

  const events = eventsQuery.data ?? [];
  const lastEventId = useMemo(() => events.at(-1)?.id ?? 0, [events]);

  useEffect(() => {
    if (!chatId) {
      return undefined;
    }

    return subscribeJobEvents({
      chatId,
      jobId,
      afterEventId: lastEventId,
      onEvent: (event) => {
        queryClient.setQueryData<JobEvent[]>(["job-events", jobId, chatId], (current) => {
          const list = current ?? [];
          if (list.some((item) => item.id === event.id)) {
            return list;
          }
          return [...list, event];
        });
        queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
      }
    });
  }, [chatId, jobId, lastEventId, queryClient]);

  return (
    <div className="space-y-4">
      {!chatId ? (
        <Card className="theme-surface">
          <CardHeader>
            <CardTitle>Missing Chat ID</CardTitle>
            <CardDescription>Set your chat ID in Settings before using timeline.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="theme-surface">
        <CardHeader>
          <CardTitle className="font-mono text-sm">{jobId}</CardTitle>
          <CardDescription>{jobQuery.data?.projectName ?? "Project"}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">{jobQuery.data?.request ?? "Loading..."}</p>
          <Link to="/" className="mt-3 inline-flex text-sm font-semibold text-primary">
            Back to Jobs
          </Link>
        </CardContent>
      </Card>

      <JobTimeline events={events} />
    </div>
  );
}

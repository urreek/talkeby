import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobEvent } from "@/lib/types";

function formatEventTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

export function JobTimeline({ events }: { events: JobEvent[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>No events yet for this job.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>Live stream from backend event bus.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-xl border border-border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{event.eventType}</p>
                <p className="text-xs text-muted-foreground">{formatEventTimestamp(event.createdAt)}</p>
              </div>
              <p className="mt-1 text-sm text-foreground/85">{event.message}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

import type { JobEvent } from "@/lib/types";

type SubscriberOptions = {
  chatId: string;
  jobId?: string;
  afterEventId?: number;
  onEvent: (event: JobEvent) => void;
  onError?: (error: Event) => void;
};

const EVENT_TYPES = [
  "job_pending_approval",
  "job_approved",
  "job_denied",
  "job_queued",
  "job_running",
  "job_progress",
  "job_completed",
  "job_failed"
];

export function subscribeJobEvents(options: SubscriberOptions) {
  const params = new URLSearchParams();
  params.set("chatId", options.chatId);
  if (options.jobId) {
    params.set("jobId", options.jobId);
  }
  if (options.afterEventId && options.afterEventId > 0) {
    params.set("afterEventId", String(options.afterEventId));
  }

  const source = new EventSource(`/api/events?${params.toString()}`);

  const handleMessage = (input: Event) => {
    const messageEvent = input as MessageEvent<string>;
    try {
      const parsed = JSON.parse(messageEvent.data) as JobEvent;
      options.onEvent(parsed);
    } catch {
      // Ignore malformed event payloads to keep stream alive.
    }
  };

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, handleMessage as EventListener);
  }

  source.onerror = (error) => {
    options.onError?.(error);
  };

  return () => {
    for (const type of EVENT_TYPES) {
      source.removeEventListener(type, handleMessage as EventListener);
    }
    source.close();
  };
}

import type { JobEvent } from "@/lib/types";

type SubscriberOptions = {
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
  "job_failed",
  "job_cancelled",
  "job_skipped_duplicate",
  "thread_token_usage",
  "thread_context_trimmed",
  "job_context_prepared",
  "runtime_approval_requested",
  "runtime_approval_resolved",
  "runtime_approval_user_approved",
  "runtime_approval_user_denied",
  "runtime_approval_auto_approved",
  "agent_log",
];

export function subscribeJobEvents(options: SubscriberOptions) {
  const params = new URLSearchParams();
  if (options.jobId) {
    params.set("jobId", options.jobId);
  }
  if (options.afterEventId && options.afterEventId > 0) {
    params.set("afterEventId", String(options.afterEventId));
  }

  const query = params.toString();
  const source = new EventSource(`/api/events${query ? `?${query}` : ""}`);

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

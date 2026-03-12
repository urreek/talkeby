import { serializeEvent } from "./serializers.mjs";
import { textValue } from "./shared.mjs";

function writeSseEvent(reply, event) {
  const safeEvent = serializeEvent(event);
  reply.raw.write(`id: ${safeEvent.id}\n`);
  reply.raw.write(`event: ${safeEvent.eventType}\n`);
  reply.raw.write(`data: ${JSON.stringify(safeEvent)}\n\n`);
}

export function registerEventRoute(app, eventBus) {
  app.get("/api/events", async (request, reply) => {
    const afterEventId = textValue(request.query?.afterEventId || request.headers["last-event-id"] || "0");
    const limitInput = Number.parseInt(String(request.query?.limit || 200), 10);
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 500)) : 200;
    const jobId = textValue(request.query?.jobId || "");

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write("retry: 5000\n\n");

    const historical = eventBus.listEventsAfter({
      afterEventId,
      limit,
    });
    for (const event of historical) {
      if (jobId && String(event.jobId) !== jobId) {
        continue;
      }
      writeSseEvent(reply, event);
    }

    const unsubscribe = eventBus.subscribe({
      reply,
      jobId,
    });
    request.raw.on("close", () => {
      unsubscribe();
    });
  });
}

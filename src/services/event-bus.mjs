function writeSseEvent(stream, event) {
  stream.raw.write(`id: ${event.id}\n`);
  stream.raw.write(`event: ${event.eventType}\n`);
  stream.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export class EventBus {
  constructor(repository) {
    this.repository = repository;
    this.clients = new Map();
    this.lastClientId = 0;
  }

  listEventsAfter({ afterEventId, limit }) {
    return this.repository.listEventsAfter({ afterEventId, limit });
  }

  publish({ jobId, chatId, eventType, message, payload }) {
    const event = this.repository.addJobEvent({
      jobId,
      chatId,
      eventType,
      message,
      payload,
    });

    if (!event) {
      return null;
    }

    for (const client of this.clients.values()) {
      if (client.jobId && String(client.jobId) !== String(jobId)) {
        continue;
      }
      try {
        writeSseEvent(client.reply, event);
      } catch {
        // Ignore transient network errors; close handlers prune clients.
      }
    }
    return event;
  }

  subscribe({ reply, jobId }) {
    this.lastClientId += 1;
    const id = this.lastClientId;
    this.clients.set(id, {
      reply,
      jobId: jobId ? String(jobId) : "",
    });
    return () => {
      this.clients.delete(id);
    };
  }
}

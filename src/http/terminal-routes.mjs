import { textValue } from "./shared.mjs";

function writeTerminalEvent(reply, event) {
  reply.raw.write(`id: ${event.id}\n`);
  reply.raw.write(`event: ${event.eventType}\n`);
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function parseEventId(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parseLimit(value, fallback = 500) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(parsed, 1000));
}

export function registerTerminalRoutes(app, terminalManager) {
  app.get("/api/terminal", async (request) => {
    const afterEventId = parseEventId(request.query?.afterEventId);
    const limit = parseLimit(request.query?.limit, 500);

    return {
      session: terminalManager.getSession(),
      events: terminalManager.listEventsAfter({ afterEventId, limit }),
    };
  });

  app.post("/api/terminal", async (request) => {
    const cwd = textValue(request.body?.cwd || "");
    const session = terminalManager.ensureSession({ cwd });
    return {
      session,
      events: terminalManager.listEventsAfter({ afterEventId: 0, limit: 500 }),
    };
  });

  app.post("/api/terminal/input", async (request, reply) => {
    const input = String(request.body?.input ?? "");
    if (!input) {
      reply.code(400);
      return {
        error: "input is required.",
      };
    }

    try {
      const session = terminalManager.writeInput(input);
      return { ok: true, session };
    } catch (error) {
      reply.code(400);
      return {
        error: error instanceof Error ? error.message : "Could not write to terminal.",
      };
    }
  });

  app.post("/api/terminal/clear", async (request, reply) => {
    try {
      const session = terminalManager.clearSession();
      return { ok: true, session };
    } catch (error) {
      reply.code(400);
      return {
        error: error instanceof Error ? error.message : "Could not clear terminal.",
      };
    }
  });

  app.post("/api/terminal/close", async () => ({
    ok: true,
    session: terminalManager.closeSession(),
  }));

  app.get("/api/terminal/events", async (request, reply) => {
    const afterEventId = parseEventId(
      request.query?.afterEventId ?? request.headers["last-event-id"],
    );
    const limit = parseLimit(request.query?.limit, 500);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write("retry: 5000\n\n");

    const historical = terminalManager.listEventsAfter({ afterEventId, limit });
    for (const event of historical) {
      writeTerminalEvent(reply, event);
    }

    const unsubscribe = terminalManager.subscribe((event) => {
      try {
        writeTerminalEvent(reply, event);
      } catch {
        unsubscribe();
      }
    });

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import fastify from "fastify";
import { createDatabase } from "../../src/db/database.mjs";
import { TalkebyRepository } from "../../src/db/repository.mjs";
import { RuntimeState } from "../../src/services/runtime-state.mjs";
import { EventBus } from "../../src/services/event-bus.mjs";
import { registerRoutes } from "../../src/http/routes.mjs";
import { registerSecurityHooks } from "../../src/http/security.mjs";

export const png = {
  name: "sample.png", mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8d0AAAAASUVORK5CYII=",
};

export async function createImageHarness({ mode = "auto", ownerKey = "" } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-image-tests-"));
  const workdir = path.join(directory, "workdir");
  await fs.mkdir(workdir);
  const { db, sqlite } = createDatabase({ filePath: path.join(directory, "db.sqlite") });
  const repository = new TalkebyRepository(db);
  const config = {
    app: { defaultExecutionMode: mode, progressUpdates: false },
    workspace: { projects: new Map([["demo", workdir]]), defaultProjectName: "demo", workdir },
    runner: { provider: "codex", binaries: { codex: "codex" }, timeoutMs: 5000 },
    codex: { parityMode: true, sandboxMode: "read-only", disableSessionResume: false },
    runtimePolicy: { enabled: false },
    providers: { discoverModels: false },
    threads: { defaultTokenBudget: 10000 },
    security: { ownerKey, csrfSecret: "test-secret", sessionCookieName: "owner_session", rateLimitPerMinute: 1000, sessionTtlMs: 60000, csrfTtlMs: 60000 },
  };
  const state = new RuntimeState({ config, repository });
  state.hydrate();
  const thread = repository.createThread({ id: "thread", projectName: "demo", title: "Thread" });
  const eventBus = new EventBus(repository);
  const enqueued = [];
  const jobRunner = { enqueue: (job) => enqueued.push(job), isThreadRunning: () => false };
  const app = fastify();
  const security = registerSecurityHooks({ app, config });
  registerRoutes({ app, config, state, repository, eventBus, jobRunner, security });
  const csrfResponse = ownerKey ? null : await app.inject("/api/security/csrf");
  const headers = csrfResponse ? { "x-csrf-token": csrfResponse.json().token } : {};
  return { app, directory, workdir, repository, state, config, eventBus, jobRunner, enqueued, thread, headers,
    async close() { await app.close(); sqlite.close(); await fs.rm(directory, { recursive: true, force: true }); },
  };
}

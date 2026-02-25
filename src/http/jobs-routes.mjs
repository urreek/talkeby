import {
  approveJob,
  createJobFromTask,
  denyJob,
  resumeJobFromError,
  retryJob,
} from "../services/job-lifecycle.mjs";
import { isAuthorizedChat, textValue } from "./shared.mjs";

export function registerJobRoutes({
  app,
  config,
  state,
  eventBus,
  jobRunner,
  repository,
}) {
  app.get("/jobs", async () => state.listJobs(200));

  app.get("/api/jobs", async (request, reply) => {
    const limit = Number.parseInt(String(request.query?.limit || 100), 10);
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
    const chatId = textValue(request.query?.chatId || "");
    const status = textValue(request.query?.status || "").toLowerCase();
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    let jobs = state.listJobs(Math.min(500, safeLimit * 2));
    jobs = jobs.filter((job) => String(job.chatId) === chatId);
    if (status) {
      jobs = jobs.filter((job) => String(job.status).toLowerCase() === status);
    }
    return jobs.slice(0, safeLimit);
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const job = state.getJobById(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Job not found" };
    }
    if (String(job.chatId) !== chatId) {
      reply.code(403);
      return { error: "Job does not belong to this chat." };
    }
    return job;
  });

  app.post("/api/jobs", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    const task = textValue(request.body?.task || request.body?.request || "");
    const projectName = textValue(request.body?.projectName || "");
    const threadId = textValue(request.body?.threadId || "");

    if (!chatId || !task) {
      reply.code(400);
      return {
        error: "chatId and task are required.",
      };
    }

    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return {
        error: "Chat is not authorized.",
      };
    }

    const created = createJobFromTask({
      state,
      eventBus,
      jobRunner,
      config,
      chatId,
      task,
      projectName,
      threadId: threadId || undefined,
    });

    if (created.error) {
      reply.code(400);
      return {
        error: created.error,
      };
    }

    return {
      ok: true,
      jobId: created.job.id,
      status: created.job.status,
      executionMode: created.executionMode,
      queuePosition: created.queuePosition ?? null,
      projectName: created.job.projectName,
    };
  });

  app.get("/api/jobs/:id/events", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const job = state.getJobById(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Job not found" };
    }
    if (String(job.chatId) !== chatId) {
      reply.code(403);
      return { error: "Job does not belong to this chat." };
    }

    const limitInput = Number.parseInt(String(request.query?.limit || 200), 10);
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 500)) : 200;
    return repository.listEventsForJob({
      jobId: request.params.id,
      limit,
    });
  });

  app.get("/api/jobs/:id/context", async (request, reply) => {
    const chatId = textValue(request.query?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const job = state.getJobById(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Job not found" };
    }
    if (String(job.chatId) !== chatId) {
      reply.code(403);
      return { error: "Job does not belong to this chat." };
    }

    const events = repository.listEventsForJob({
      jobId: request.params.id,
      limit: 500,
    });
    let contextEvent = null;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (String(event.eventType || "") === "job_context_prepared") {
        contextEvent = event;
        break;
      }
    }

    return {
      jobId: request.params.id,
      eventId: contextEvent?.id ?? null,
      createdAt: contextEvent?.createdAt ?? null,
      context: contextEvent?.payload ?? null,
    };
  });

  app.post("/api/jobs/:id/approve", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const approved = approveJob({
      state,
      eventBus,
      jobRunner,
      chatId,
      jobId: request.params.id,
    });
    if (approved.error) {
      reply.code(400);
      return { error: approved.error };
    }

    return {
      ok: true,
      jobId: approved.job.id,
      status: approved.job.status,
      queuePosition: approved.queuePosition,
    };
  });

  app.post("/api/jobs/:id/deny", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const denied = denyJob({
      state,
      eventBus,
      chatId,
      jobId: request.params.id,
    });
    if (denied.error) {
      reply.code(400);
      return { error: denied.error };
    }

    return {
      ok: true,
      jobId: denied.job.id,
      status: denied.job.status,
    };
  });

  app.post("/api/jobs/:id/retry", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const retried = retryJob({
      state,
      eventBus,
      jobRunner,
      config,
      chatId,
      jobId: request.params.id,
    });
    if (retried.error) {
      reply.code(400);
      return { error: retried.error };
    }

    return {
      ok: true,
      jobId: retried.job.id,
      status: retried.job.status,
      executionMode: retried.executionMode,
      queuePosition: retried.queuePosition ?? null,
      projectName: retried.job.projectName,
    };
  });

  app.post("/api/jobs/:id/resume-error", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const resumed = resumeJobFromError({
      state,
      eventBus,
      jobRunner,
      config,
      chatId,
      jobId: request.params.id,
    });
    if (resumed.error) {
      reply.code(400);
      return { error: resumed.error };
    }

    return {
      ok: true,
      jobId: resumed.job.id,
      status: resumed.job.status,
      executionMode: resumed.executionMode,
      queuePosition: resumed.queuePosition ?? null,
      projectName: resumed.job.projectName,
    };
  });

  app.post("/api/jobs/:id/stop", async (request, reply) => {
    const chatId = textValue(request.body?.chatId || "");
    if (!chatId) {
      reply.code(400);
      return { error: "chatId is required." };
    }
    if (!isAuthorizedChat(config, chatId)) {
      reply.code(403);
      return { error: "Chat is not authorized." };
    }

    const result = jobRunner.stop({
      chatId,
      jobId: request.params.id,
    });
    if (result?.error) {
      reply.code(400);
      return { error: result.error };
    }

    return {
      ok: true,
      jobId: request.params.id,
      status: "cancelled",
    };
  });
}

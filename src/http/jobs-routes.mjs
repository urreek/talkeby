import {
  approveJob,
  createJobFromTask,
  denyJob,
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
      chatId,
      task,
      projectName,
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
}

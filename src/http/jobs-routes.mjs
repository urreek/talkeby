import {
  approveJob,
  createJobFromTask,
  denyJob,
  resumeJobFromError,
  retryJob,
} from "../services/job-lifecycle.mjs";
import {
  serializeEvents,
  serializeJob,
  serializeJobs,
} from "./serializers.mjs";
import { textValue } from "./shared.mjs";

export function registerJobRoutes({
  app,
  state,
  eventBus,
  jobRunner,
  repository,
  config,
}) {
  app.get("/jobs", async () => serializeJobs(state.listJobs(200)));

  app.get("/api/jobs", async (request) => {
    const limit = Number.parseInt(String(request.query?.limit || 100), 10);
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
    const status = textValue(request.query?.status || "").toLowerCase();
    const threadId = textValue(request.query?.threadId || "");

    let jobs = state.listJobs(Math.min(5000, safeLimit * 5));
    if (status) {
      jobs = jobs.filter((job) => String(job.status).toLowerCase() === status);
    }
    if (threadId) {
      jobs = jobs.filter((job) => String(job.threadId || "") === threadId);
    }
    return serializeJobs(jobs.slice(0, safeLimit));
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const job = state.getJobById(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Job not found." };
    }
    return serializeJob(job);
  });

  app.post("/api/jobs", async (request, reply) => {
    const task = textValue(request.body?.task || request.body?.request || "");
    const projectName = textValue(request.body?.projectName || "");
    const threadId = textValue(request.body?.threadId || "");

    if (!task || !threadId) {
      reply.code(400);
      return {
        error: "task and threadId are required.",
      };
    }

    const created = createJobFromTask({
      state,
      eventBus,
      jobRunner,
      config,
      task,
      projectName,
      threadId,
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
      threadId: created.job.threadId,
    };
  });

  app.get("/api/jobs/:id/events", async (request, reply) => {
    const job = state.getJobById(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "Job not found." };
    }

    const limitInput = Number.parseInt(String(request.query?.limit || 200), 10);
    const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 500)) : 200;
    return serializeEvents(repository.listEventsForJob({
      jobId: request.params.id,
      limit,
    }));
  });

  app.post("/api/jobs/:id/approve", async (request, reply) => {
    const approved = approveJob({
      state,
      eventBus,
      jobRunner,
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
    const denied = denyJob({
      state,
      eventBus,
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
    const retried = retryJob({
      state,
      eventBus,
      jobRunner,
      config,
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
      threadId: retried.job.threadId,
    };
  });

  app.post("/api/jobs/:id/resume-error", async (request, reply) => {
    const resumed = resumeJobFromError({
      state,
      eventBus,
      jobRunner,
      config,
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
      threadId: resumed.job.threadId,
    };
  });

  app.post("/api/jobs/:id/stop", async (request, reply) => {
    const result = jobRunner.stop({
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

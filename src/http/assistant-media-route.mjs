import { openAssistantMedia } from "../services/assistant-media.mjs";
import { resolveAssistantImageJob } from "../services/assistant-image-job.mjs";
import { parseMediaRange } from "../services/media-range.mjs";
import { PreviewRetention } from "../services/preview-retention.mjs";

export function registerAssistantMediaRoute({ app, state, config, repository }) {
  const retention = new PreviewRetention({
    projects: config.workspace.projects, options: config.media, log: app.log,
    getActiveGroups: () => new Set(state.listJobs(5000).filter((job) => ["running", "queued", "pending_approval"].includes(job.status)).map((job) => job.id)),
  });
  app.addHook("onReady", async () => retention.start());
  app.addHook("onClose", async () => retention.stop());
  app.get("/api/jobs/:id/output-media", {
    schema: {
      params: { type: "object", required: ["id"], properties: { id: { type: "string", minLength: 1, maxLength: 200 } } },
      querystring: {
        type: "object", required: ["path"], additionalProperties: false,
        properties: { path: { type: "string", minLength: 1, maxLength: 2048 } },
      },
    },
  }, async (request, reply) => {
    const job = await resolveAssistantImageJob({ jobId: request.params.id, state, repository, projects: config.workspace.projects });
    const media = await openAssistantMedia({
      job, reference: request.query.path, projectRoot: config.workspace.projects.get(job?.projectName),
      maxVideoBytes: config.media?.maxVideoBytes,
      retentionHours: config.media?.retentionHours,
    });
    if (!media) return reply.code(404).send({ error: "Preview expired, too large, or unavailable." });
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Accept-Ranges", "bytes").type(media.mimeType);
    const range = parseMediaRange(request.headers.range, media.size);
    if (range === false) {
      await media.close();
      return reply.code(416).header("Content-Range", `bytes */${media.size}`).send();
    }
    if (range) reply.code(206).header("Content-Range", `bytes ${range.start}-${range.end}/${media.size}`);
    reply.header("Content-Length", range ? range.end - range.start + 1 : media.size);
    if (request.method === "HEAD") { await media.close(); return reply.send(); }
    return reply.send(media.stream(range || {}));
  });
}

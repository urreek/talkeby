import { openMediaForReply } from "./media-response.mjs";
import { mediaKind } from "../../shared/assistant-media.mjs";
import { resolveAssistantImageJob } from "../services/assistant-image-job.mjs";

export function registerAssistantImagesRoute({ app, state, config, repository }) {
  app.get("/api/jobs/:id/output-image", {
    schema: {
      params: { type: "object", required: ["id"], properties: { id: { type: "string", minLength: 1, maxLength: 200 } } },
      querystring: {
        type: "object", required: ["path"], additionalProperties: false,
        properties: { path: { type: "string", minLength: 1, maxLength: 2048 } },
      },
    },
  }, async (request, reply) => {
    const job = await resolveAssistantImageJob({
      jobId: request.params.id, state, repository, projects: config.workspace.projects,
    });
    if (mediaKind(request.query.path) !== "image") return reply.code(404).send({ error: "Image not found or unavailable." });
    const image = await openMediaForReply({
      job, reference: request.query.path,
      projectRoot: config.workspace.projects.get(job?.projectName),
      retentionHours: config.media?.retentionHours,
    }, reply);
    if (!image) return reply;
    return reply.header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .type(image.mimeType).send(image.stream());
  });
}

import { openAssistantMedia } from "../services/assistant-media.mjs";
import { MediaUnavailableError } from "../services/media-unavailable.mjs";

export async function openMediaForReply(options, reply) {
  try {
    const media = await openAssistantMedia({ ...options, explainUnavailable: true });
    if (!media) reply.code(404).send({ code: "MEDIA_NOT_FOUND", error: "Preview not found or unavailable." });
    return media;
  } catch (error) {
    if (!(error instanceof MediaUnavailableError)) throw error;
    reply.code(error.statusCode).send({ code: error.code, error: error.message });
    return null;
  }
}

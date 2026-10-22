import { MEDIA_FAILURE_MESSAGES } from "../../shared/media-preview-errors.mjs";

export class MediaUnavailableError extends Error {
  constructor(code) {
    super(MEDIA_FAILURE_MESSAGES[code]);
    this.code = code;
    this.statusCode = code === "MEDIA_EXPIRED" ? 410 : 404;
  }
}

export function unavailableMedia(options, code) {
  if (options.explainUnavailable) throw new MediaUnavailableError(code);
  return null;
}

export const MEDIA_FAILURE_MESSAGES = {
  MEDIA_EXPIRED: "This preview has reached its retention expiry. Request a new capture.",
  MEDIA_TOO_LARGE: "This preview exceeds the file size limit. Request a smaller capture.",
  MEDIA_DIMENSIONS_EXCEEDED: "This image is too large to preview. Request a smaller image.",
  MEDIA_UNSUPPORTED: "This file is not a supported image or video format.",
  MEDIA_NOT_FOUND: "This preview file could not be found. Request a new capture.",
};

export async function diagnoseMediaFailure(url, kind, { signal, fetcher = fetch } = {}) {
  try {
    // A one-byte range distinguishes missing/expired media from browser decoding
    // failures without downloading an entire video just to explain the error.
    const response = await fetcher(url, { headers: { Range: "bytes=0-0" }, cache: "no-store", signal });
    if (response.ok) {
      await response.body?.cancel();
      return kind === "video"
        ? "Your browser could not play this video. Download it to watch in another player, or retry."
        : "Your browser could not display this image. Download it or retry.";
    }
    if (response.status === 401) return "Your session has expired. Sign in again to view this preview.";
    const payload = await response.json();
    return MEDIA_FAILURE_MESSAGES[payload?.code] || "Preview could not be loaded. Check your connection and retry.";
  } catch {
    return "Preview could not be loaded. Check your connection and retry.";
  }
}

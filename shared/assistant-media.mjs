export const MAX_PREVIEW_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PREVIEW_VIDEO_BYTES = 24 * 1024 * 1024;
export const PREVIEW_DIRECTORY = "talkeby-previews";

export function mediaKind(reference) {
  if (typeof reference !== "string") return null;
  if (/\.(png|jpe?g|webp|gif)$/i.test(reference)) return "image";
  return /\.(mp4|webm)$/i.test(reference) ? "video" : null;
}

export function localMediaPath(reference) {
  if (typeof reference !== "string" || reference.length > 2048) return null;
  let value;
  try { value = decodeURIComponent(reference); } catch { return null; }
  value = value.replace(/^sandbox:/, "").replaceAll("\\", "/");
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:\//i.test(value)) return null;
  if (value.startsWith("//") || /[\x00-\x1f\x7f?#]/.test(value)) return null;
  if (value.split("/").some((part) => part.startsWith(".") && part !== "." && part !== "..")) return null;
  return mediaKind(value) ? value : null;
}

export function referencedMediaPaths(markdown) {
  const paths = new Set();
  for (const match of String(markdown || "").matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*["'])?\s*\)/g)) {
    const value = localMediaPath(match[1] || match[2]);
    if (value) paths.add(value);
  }
  return paths;
}

export function assistantMediaUrl(jobId, reference) {
  const value = localMediaPath(reference);
  return value ? `/api/jobs/${encodeURIComponent(jobId)}/output-media?path=${encodeURIComponent(value)}` : null;
}

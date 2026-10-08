export const MAX_ASSISTANT_IMAGE_BYTES = 5 * 1024 * 1024;

// Keep browser routing and server authorization on the same path rules.
export function localImagePath(reference) {
  if (typeof reference !== "string" || reference.length > 2048) return null;
  let value;
  try { value = decodeURIComponent(reference); } catch { return null; }
  value = value.replace(/^sandbox:/, "").replaceAll("\\", "/");
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:\//i.test(value)) return null;
  if (value.startsWith("//") || /[\x00-\x1f\x7f?#]/.test(value)) return null;
  if (value.split("/").some((part) => part.startsWith(".") && part !== "." && part !== "..")) return null;
  return /\.(png|jpe?g|webp|gif)$/i.test(value) ? value : null;
}

export function referencedImagePaths(markdown) {
  const paths = new Set();
  // Inline Markdown links/images, including angle brackets for paths with spaces.
  for (const match of String(markdown || "").matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*["'])?\s*\)/g)) {
    const value = localImagePath(match[1] || match[2]);
    if (value) paths.add(value);
  }
  return paths;
}

export function assistantImageUrl(jobId, reference) {
  const value = localImagePath(reference);
  return value ? `/api/jobs/${encodeURIComponent(jobId)}/output-image?path=${encodeURIComponent(value)}` : null;
}

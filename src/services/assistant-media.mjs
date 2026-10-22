import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";

import { localMediaPath, mediaKind, referencedMediaPaths, MAX_PREVIEW_IMAGE_BYTES, MAX_PREVIEW_IMAGE_PIXELS, MAX_PREVIEW_VIDEO_BYTES, PREVIEW_DIRECTORY } from "../../shared/assistant-media.mjs";
import { inspectMediaSignature } from "./media-signature.mjs";
import { MediaUnavailableError, unavailableMedia } from "./media-unavailable.mjs";

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function openSourceMedia(options) {
  const { job, reference, projectRoot, maxVideoBytes = MAX_PREVIEW_VIDEO_BYTES } = options;
  const mediaPath = localMediaPath(reference);
  if (!job || !projectRoot || !mediaPath || !referencedMediaPaths(job.summary).has(mediaPath)) return null;
  let handle;
  try {
    const root = await fs.realpath(projectRoot);
    if (root !== await fs.realpath(job.workdir)) return null;
    const candidate = path.resolve(root, mediaPath);
    if (!inside(root, candidate)) return null;
    const resolved = await fs.realpath(candidate);
    if (!inside(root, resolved) || !localMediaPath(path.relative(root, resolved))) return null;
    handle = await fs.open(resolved, "r");
    const stat = await handle.stat();
    const kind = mediaKind(mediaPath);
    const limit = kind === "image" ? MAX_PREVIEW_IMAGE_BYTES : Math.min(maxVideoBytes, MAX_PREVIEW_VIDEO_BYTES);
    if (!stat.isFile() || stat.size <= 0) return unavailableMedia(options, "MEDIA_NOT_FOUND");
    if (stat.size > limit) return unavailableMedia(options, "MEDIA_TOO_LARGE");
    const header = Buffer.alloc(Math.min(64 * 1024, stat.size));
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const metadata = inspectMediaSignature(header.subarray(0, bytesRead), stat.size);
    if (!metadata || !metadata.mimeType.startsWith(`${kind}/`)) return unavailableMedia(options, "MEDIA_UNSUPPORTED");
    if (kind === "image" && (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PREVIEW_IMAGE_PIXELS)) {
      return unavailableMedia(options, "MEDIA_DIMENSIONS_EXCEEDED");
    }
    const file = handle;
    handle = null;
    return {
      ...metadata, size: stat.size,
      close: () => file.close(),
      stream: (range = {}) => file.createReadStream({ ...range, autoClose: true, highWaterMark: 64 * 1024 }),
    };
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(error.code)) return unavailableMedia(options, "MEDIA_NOT_FOUND");
    throw error;
  } finally { await handle?.close(); }
}

const pendingCopies = new Map();
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

async function managedDirectory(projectRoot, jobId) {
  const project = await fs.realpath(projectRoot);
  let directory = project;
  for (const segment of [PREVIEW_DIRECTORY, hash(jobId)]) {
    directory = path.join(directory, segment);
    await fs.mkdir(directory).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory) {
      throw Object.assign(new Error("Preview storage must be a project-local directory."), { code: "UNSAFE_MEDIA_DIRECTORY" });
    }
  }
  return directory;
}

async function archiveMedia(options, mediaPath) {
  const { job, projectRoot, retentionHours = 168, now = Date.now() } = options;
  const completed = Date.parse(job.completedAt || job.createdAt || "");
  if (Number.isFinite(completed) && now - completed >= retentionHours * 3_600_000) return unavailableMedia(options, "MEDIA_EXPIRED");
  const directory = await managedDirectory(projectRoot, job.id);
  const filename = path.join(directory, `${hash(mediaPath)}${path.extname(mediaPath).toLowerCase()}`);
  const storedPath = path.relative(projectRoot, filename).replaceAll("\\", "/");
  const storedOptions = { ...options, explainUnavailable: false, reference: storedPath, job: { ...job, summary: `[Media](${storedPath})` } };
  const existing = await openSourceMedia(storedOptions);
  if (existing) {
    const stat = await fs.stat(filename);
    if (now - stat.mtimeMs < retentionHours * 3_600_000) return existing;
    await existing.close();
    return unavailableMedia(options, "MEDIA_EXPIRED");
  }
  const source = await openSourceMedia({ ...options, reference: mediaPath });
  if (!source) return null;
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try {
    await pipeline(source.stream({ start: 0, end: source.size - 1 }), (await fs.open(temporary, "wx", 0o600)).createWriteStream());
    const savedAt = new Date(Number.isFinite(completed) ? Math.min(completed, now) : now);
    await fs.utimes(temporary, savedAt, savedAt);
    await fs.rename(temporary, filename);
  } finally {
    await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
  return openSourceMedia(storedOptions);
}

export async function openAssistantMedia(options) {
  const { job, reference, projectRoot } = options;
  const mediaPath = localMediaPath(reference);
  if (!job?.id || !projectRoot || !mediaPath || !referencedMediaPaths(job.summary).has(mediaPath)) return null;
  // Validate the workspace even when a previously saved copy exists.
  if (await fs.realpath(projectRoot) !== await fs.realpath(job.workdir)) return null;
  const key = `${projectRoot}:${job.id}:${mediaPath}`;
  while (pendingCopies.has(key)) await pendingCopies.get(key);
  const pending = archiveMedia(options, mediaPath);
  pendingCopies.set(key, pending.then(() => {}, () => {}));
  try { return await pending; }
  finally { pendingCopies.delete(key); }
}

export async function persistAssistantMedia({ onError, ...options }) {
  for (const reference of referencedMediaPaths(options.job.summary)) {
    try {
      const media = await openAssistantMedia({ ...options, reference, explainUnavailable: true });
      if (!media) throw new MediaUnavailableError("MEDIA_NOT_FOUND");
      await media.close();
    } catch (error) {
      if (!onError) throw error;
      onError(error);
    }
  }
}

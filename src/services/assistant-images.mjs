import { promises as fs } from "node:fs";
import path from "node:path";
import { localImagePath, referencedImagePaths, MAX_ASSISTANT_IMAGE_BYTES } from "../../shared/assistant-images.mjs";

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function imageMime(bytes) {
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return "image/jpeg";
  if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) === bytes.length - 8) return "image/webp";
  if (bytes.length >= 14 && /^(GIF87a|GIF89a)$/.test(bytes.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

export async function readAssistantImage({ job, reference, projectRoot }) {
  const imagePath = localImagePath(reference);
  if (!job || !projectRoot || !imagePath || !referencedImagePaths(job.summary).has(imagePath)) return null;
  try {
    const root = await fs.realpath(projectRoot);
    const workdir = await fs.realpath(job.workdir);
    if (root !== workdir) return null;
    const candidate = path.resolve(root, imagePath);
    if (!inside(root, candidate)) return null;
    const resolved = await fs.realpath(candidate);
    if (!inside(root, resolved) || !localImagePath(path.relative(root, resolved))) return null;
    const handle = await fs.open(resolved, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_ASSISTANT_IMAGE_BYTES) return null;
      const bytes = Buffer.alloc(MAX_ASSISTANT_IMAGE_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const result = await handle.read(bytes, length, bytes.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length > MAX_ASSISTANT_IMAGE_BYTES) return null;
      const data = bytes.subarray(0, length);
      const mimeType = imageMime(data);
      return mimeType ? { data, mimeType } : null;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(error.code)) return null;
    throw error;
  }
}

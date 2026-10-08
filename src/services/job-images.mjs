import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES } from "../../shared/image-limits.mjs";

const imageSchema = z.object({
  name: z.string().trim().min(1).max(200).refine((name) => !/[\x00-\x1f\x7f]/.test(name)),
  mimeType: z.enum(IMAGE_TYPES),
  data: z.string().min(4).max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
}).strict();
const imagesSchema = z.array(imageSchema).max(MAX_IMAGES);

function matchesImageType(bytes, mimeType) {
  if (mimeType === "image/png") {
    return bytes.length >= 33
      && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      && bytes.toString("ascii", 12, 16) === "IHDR"
      && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  return bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP"
    && bytes.readUInt32LE(4) === bytes.length - 8;
}

export function validateJobImages(input = []) {
  const result = imagesSchema.safeParse(input);
  if (!result.success) {
    return { error: "Attach up to 3 PNG, JPEG, or WebP images, each at most 5 MB." };
  }
  let total = 0;
  for (const image of result.data) {
    const bytes = Buffer.from(image.data, "base64");
    if (bytes.toString("base64") !== image.data || bytes.length > MAX_IMAGE_BYTES
      || !matchesImageType(bytes, image.mimeType)) {
      return { error: "Image data is invalid or does not match its PNG, JPEG, or WebP type." };
    }
    total += bytes.length;
  }
  if (total > MAX_TOTAL_IMAGE_BYTES) return { error: "Images must total at most 10 MB." };
  return { images: result.data };
}

export function validateImageProvider(provider, images) {
  return images.length && provider !== "codex"
    ? "Image attachments currently require the Codex provider. Select Codex and try again."
    : "";
}

// Persisted data stays in SQLite; only execution needs local files. Never use client filenames as paths.
export async function materializeJobImages(repository, jobId, provider) {
  const images = repository?.listJobImages?.(jobId, true) || [];
  const error = validateImageProvider(provider, images);
  if (error) throw new Error(error);
  if (!images.length) return { paths: [], cleanup: async () => {} };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-images-"));
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  try {
    const paths = [];
    for (const [index, image] of images.entries()) {
      const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[image.mimeType];
      const filePath = path.join(directory, `${index}.${extension}`);
      await fs.writeFile(filePath, Buffer.from(image.data, "base64"), { mode: 0o600 });
      paths.push(filePath);
    }
    return { paths, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

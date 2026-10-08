import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { jobImagesTable } from "./schema.mjs";

export function insertJobImages(db, jobId, images) {
  for (const [position, image] of images.entries()) {
    db.insert(jobImagesTable).values({
      id: crypto.randomUUID(), jobId, position, name: image.name, mimeType: image.mimeType,
      size: Buffer.byteLength(image.data, "base64"), data: image.data,
    }).run();
  }
}

export function listJobImages(db, jobId, includeData = false) {
  const { id, name, mimeType, size, data } = jobImagesTable;
  return db.select(includeData ? { id, name, mimeType, size, data } : { id, name, mimeType, size })
    .from(jobImagesTable).where(eq(jobImagesTable.jobId, jobId)).orderBy(jobImagesTable.position).all();
}

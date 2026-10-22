import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { localMediaPath, referencedMediaPaths } from "../shared/assistant-media.mjs";
import { diagnoseMediaFailure } from "../shared/media-preview-errors.mjs";
import { createImageHarness, png } from "./helpers/image-test-harness.mjs";

function pngChunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4);
  data.copy(bytes, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}

function largeScreenshot() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(3200);
  header.writeUInt32BE(2800, 4);
  header[8] = 8;
  header[9] = 2; // RGB, one filter byte per scanline.
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.alloc((3200 * 3 + 1) * 2800))), pngChunk("IEND", Buffer.alloc(0))]);
}

function createJob(harness, summary, completedAt = new Date().toISOString()) {
  return harness.state.createJob({ id: "preview-job", threadId: "thread", projectName: "demo", workdir: harness.workdir,
    request: "Preview", status: "completed", completedAt, summary });
}

test("Windows media links normalize a leading slash and sandbox prefix consistently", () => {
  for (const reference of ["/C:/Project/capture.png", "sandbox:/C:/Project/capture.png", "C:\\Project\\capture.png"]) {
    assert.equal(localMediaPath(reference), "C:/Project/capture.png");
    assert.deepEqual([...referencedMediaPaths(`![Capture](<${reference}>)`)], ["C:/Project/capture.png"]);
  }
  assert.equal(localMediaPath("//server/share/capture.png"), null);
  assert.equal(localMediaPath("file:///C:/Project/capture.png"), null);
});

test("large recent screenshots are archived and playable after deleting their source", async () => {
  const harness = await createImageHarness();
  try {
    const data = largeScreenshot();
    const filename = path.join(harness.workdir, "capture.png");
    await fs.writeFile(filename, data);
    const reference = process.platform === "win32" ? `/${filename.replaceAll("\\", "/")}` : filename;
    const job = createJob(harness, `![Capture](<sandbox:${reference}>)`);
    for (const endpoint of ["output-media", "output-image"]) {
      const url = `/api/jobs/${job.id}/${endpoint}?path=${encodeURIComponent(`sandbox:${reference}`)}`;
      const first = await harness.app.inject(url);
      assert.equal(first.statusCode, 200, first.body.slice(0, 200));
      assert.deepEqual(first.rawPayload, data);
      if (endpoint === "output-media") await fs.unlink(filename);
    }
    assert.equal((await harness.app.inject(`/api/jobs/${job.id}/output-media?path=unreferenced.png`)).statusCode, 404);
  } finally { await harness.close(); }
});

test("media endpoints identify real expiry separately from missing and unsupported files", async () => {
  const harness = await createImageHarness();
  try {
    await fs.writeFile(path.join(harness.workdir, "capture.png"), Buffer.from(png.data, "base64"));
    await fs.writeFile(path.join(harness.workdir, "invalid.mp4"), "not a video");
    const job = createJob(harness, "![Capture](capture.png) ![Missing](missing.png) [Video](invalid.mp4)");
    const url = `/api/jobs/${job.id}/output-media?path=`;
    const missing = await harness.app.inject(`${url}missing.png`);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().code, "MEDIA_NOT_FOUND");
    const unsupported = await harness.app.inject(`${url}invalid.mp4`);
    assert.equal(unsupported.statusCode, 404);
    assert.equal(unsupported.json().code, "MEDIA_UNSUPPORTED");
    harness.state.patchJob(job.id, { completedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() });
    for (const endpoint of ["output-media", "output-image"]) {
      const expired = await harness.app.inject(`/api/jobs/${job.id}/${endpoint}?path=capture.png`);
      assert.equal(expired.statusCode, 410);
      assert.equal(expired.json().code, "MEDIA_EXPIRED");
    }
  } finally { await harness.close(); }
});

test("viewer diagnoses decoding failures without claiming the file expired or downloading the video", async () => {
  let cancelled = false;
  const message = await diagnoseMediaFailure("/video", "video", { fetcher: async (url, options) => {
    assert.equal(url, "/video");
    assert.equal(options.headers.Range, "bytes=0-0");
    return { ok: true, body: { cancel: async () => { cancelled = true; } } };
  } });
  assert.equal(cancelled, true);
  assert.match(message, /browser could not play/);
  assert.match(message, /Download/);
  assert.doesNotMatch(message, /expired/);
});

test("viewer distinguishes expiry, sign-in, and retryable connection failures", async () => {
  const diagnose = (response) => diagnoseMediaFailure("/image", "image", { fetcher: async () => response });
  assert.match(await diagnose({ status: 410, json: async () => ({ code: "MEDIA_EXPIRED" }) }), /retention expiry/);
  assert.match(await diagnose({ status: 401 }), /Sign in again/);
  assert.match(await diagnose({ status: 404, json: async () => ({ code: "MEDIA_NOT_FOUND" }) }), /could not be found/);
  assert.match(await diagnose({ status: 500, json: async () => ({ error: "Internal error" }) }), /retry/);
  assert.match(await diagnoseMediaFailure("/image", "image", { fetcher: async () => { throw new Error("Network unavailable"); } }), /connection and retry/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openAssistantMedia, persistAssistantMedia } from "../src/services/assistant-media.mjs";
import { cleanupManagedPreviews } from "../src/services/preview-retention.mjs";
import { createImageHarness, png } from "./helpers/image-test-harness.mjs";
import { JobRunner } from "../src/services/job-runner.mjs";
import { setCodexSpawnCompatForTests } from "../src/runners/codex.mjs";
import { createMockCodexSpawn, withTemporaryHome } from "./helpers/codex-test-utils.mjs";

const week = 168 * 3_600_000;
const image = Buffer.from(png.data, "base64");
const video = Buffer.concat([Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex"), Buffer.alloc(20)]);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "capture.png"), image);
  await fs.writeFile(path.join(root, "recording.mp4"), video);
  const job = { id: "job", workdir: root, completedAt: new Date().toISOString(), summary: "![Capture](capture.png) [Watch](recording.mp4)" };
  return { root, job, options: { job, projectRoot: root } };
}

async function bytes(media) {
  assert.ok(media);
  const chunks = [];
  for await (const chunk of media.stream()) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("images and videos are saved eagerly and survive source removal and service restart", async (t) => {
  const { root, options } = await fixture(t);
  await persistAssistantMedia(options);
  await fs.unlink(path.join(root, "capture.png"));
  await fs.unlink(path.join(root, "recording.mp4"));
  assert.deepEqual(await bytes(await openAssistantMedia({ ...options, reference: "capture.png" })), image);
  assert.deepEqual(await bytes(await openAssistantMedia({ ...options, reference: "recording.mp4" })), video);
  const groups = await fs.readdir(path.join(root, "talkeby-previews"));
  assert.equal(groups.length, 1);
  assert.equal((await fs.readdir(path.join(root, "talkeby-previews", groups[0]))).length, 2);
});

test("saved previews remain for a week despite storage pressure, then expire without resurrection", async (t) => {
  const { root, options, job } = await fixture(t);
  const now = Date.now();
  job.completedAt = new Date(now).toISOString();
  await persistAssistantMedia({ ...options, now });
  await cleanupManagedPreviews(root, { now: now + week - 1000, maxStorageBytes: 1 });
  assert.deepEqual(await bytes(await openAssistantMedia({ ...options, reference: "capture.png", now: now + week - 1000 })), image);
  assert.equal(await openAssistantMedia({ ...options, reference: "capture.png", now: now + week }), null);
  await cleanupManagedPreviews(root, { now: now + week + 1000 });
  assert.equal((await fs.readdir(path.join(root, "talkeby-previews"))).length, 0);
  assert.equal(await openAssistantMedia({ ...options, reference: "capture.png", now: now + week + 1000 }), null);
  assert.deepEqual(await fs.readFile(path.join(root, "capture.png")), image);
});

test("archive refuses unreferenced, outside, hidden and invalid media", async (t) => {
  const { root, options } = await fixture(t);
  await fs.writeFile(path.join(root, "invalid.png"), "not an image");
  for (const reference of ["missing.png", "../capture.png", ".private/capture.png", "invalid.png", "https://example.com/capture.png"]) {
    const job = { ...options.job, summary: `![Image](${reference})` };
    assert.equal(await openAssistantMedia({ ...options, job, reference }), null);
  }
  assert.equal(await openAssistantMedia({ ...options, reference: "unreferenced.png" }), null);
});

test("worker saves linked output before publishing completion", async () => {
  const harness = await createImageHarness();
  const previousMessage = process.env.FAKE_CODEX_MESSAGE;
  try {
    await withTemporaryHome(harness.directory, async () => {
      process.env.FAKE_CODEX_MESSAGE = "![Image](capture.png)";
      setCodexSpawnCompatForTests(createMockCodexSpawn());
      await fs.writeFile(path.join(harness.workdir, "capture.png"), image);
      const job = harness.state.createJob({ id: "worker-media", threadId: "thread", projectName: "demo", workdir: harness.workdir,
        request: "Capture ![Image](capture.png)", status: "queued" });
      const runner = new JobRunner(harness);
      runner.enqueue(job);
      await runner.queue;
      const saved = harness.state.getJobById(job.id);
      assert.equal(saved.status, "completed", saved.error);
      await fs.unlink(path.join(harness.workdir, "capture.png"));
      assert.deepEqual(await bytes(await openAssistantMedia({ job: saved, projectRoot: harness.workdir, reference: "capture.png" })), image);
    });
  } finally {
    if (previousMessage === undefined) delete process.env.FAKE_CODEX_MESSAGE;
    else process.env.FAKE_CODEX_MESSAGE = previousMessage;
    setCodexSpawnCompatForTests();
    await harness.close();
  }
});

test("archive rejects a redirected storage directory", async (t) => {
  const { root, options } = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-media-outside-"));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, "talkeby-previews"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(openAssistantMedia({ ...options, reference: "capture.png" }), { code: "UNSAFE_MEDIA_DIRECTORY" });
  assert.deepEqual(await fs.readdir(outside), []);
});

test("media API supports saved video seeking and legacy images with owner authentication", async () => {
  const harness = await createImageHarness();
  try {
    await fs.writeFile(path.join(harness.workdir, "recording.mp4"), video);
    await fs.writeFile(path.join(harness.workdir, "capture.png"), image);
    const job = harness.state.createJob({ id: "media-job", threadId: "thread", projectName: "demo", workdir: harness.workdir,
      request: "Capture", status: "completed", completedAt: new Date().toISOString(), summary: "[Watch](recording.mp4) ![Image](capture.png)" });
    const url = `/api/jobs/${job.id}/output-media?path=recording.mp4`;
    assert.equal((await harness.app.inject(url)).statusCode, 200);
    await fs.unlink(path.join(harness.workdir, "recording.mp4"));
    const response = await harness.app.inject({ url, headers: { range: "bytes=4-11" } });
    assert.equal(response.statusCode, 206);
    assert.equal(response.headers["content-range"], `bytes 4-11/${video.length}`);
    assert.deepEqual(response.rawPayload, video.subarray(4, 12));
    assert.equal((await harness.app.inject({ url, headers: { range: "bytes=999-" } })).statusCode, 416);
    const legacy = `/api/jobs/${job.id}/output-image?path=capture.png`;
    assert.equal((await harness.app.inject(legacy)).statusCode, 200);
    await fs.unlink(path.join(harness.workdir, "capture.png"));
    assert.deepEqual((await harness.app.inject(legacy)).rawPayload, image);
  } finally { await harness.close(); }
  const secured = await createImageHarness({ ownerKey: "test-owner-key" });
  try { assert.equal((await secured.app.inject("/api/jobs/media-job/output-media?path=recording.mp4")).statusCode, 401); }
  finally { await secured.close(); }
});

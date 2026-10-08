import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createImageHarness, png } from "./helpers/image-test-harness.mjs";
import { validateJobImages, materializeJobImages } from "../src/services/job-images.mjs";
import { readAssistantImage } from "../src/services/assistant-images.mjs";
import { JobRunner } from "../src/services/job-runner.mjs";
import { setCodexSpawnCompatForTests } from "../src/runners/codex.mjs";
import { createMockCodexSpawn, withTemporaryHome } from "./helpers/codex-test-utils.mjs";

test("image validation rejects invalid type, base64, count and size at the service boundary", () => {
  assert.equal(validateJobImages([png]).images.length, 1);
  for (const input of [null, [png, png, png, png], [{ ...png, data: `${png.data}\n` }], [{ ...png, mimeType: "image/svg+xml" }], [{ ...png, data: "A".repeat(7 * 1024 * 1024) }]]) {
    assert.ok(validateJobImages(input).error);
  }
});

test("materialization ignores client filenames and cleans temporary files", async () => {
  const images = await materializeJobImages({ listJobImages: () => [{ ...png, name: "../../escaped.png" }] }, "job", "codex");
  try {
    assert.equal(path.basename(images.paths[0]), "0.png");
    assert.deepEqual(await fs.readFile(images.paths[0]), Buffer.from(png.data, "base64"));
    await assert.rejects(materializeJobImages({ listJobImages: () => [png] }, "job", "claude"), /require the Codex provider/);
  } finally { await images.cleanup(); }
  await assert.rejects(fs.stat(images.paths[0]), { code: "ENOENT" });
});

test("assistant images require a referenced image inside the configured workspace", async () => {
  const harness = await createImageHarness();
  try {
    await fs.writeFile(path.join(harness.workdir, "image.png"), Buffer.from(png.data, "base64"));
    await fs.writeFile(path.join(harness.directory, "outside.png"), Buffer.from(png.data, "base64"));
    const job = { workdir: harness.workdir, summary: "![Image](image.png)" };
    const valid = await readAssistantImage({ job, reference: "image.png", projectRoot: harness.workdir });
    assert.equal(valid.mimeType, "image/png");
    assert.equal(await readAssistantImage({ job, reference: "other.png", projectRoot: harness.workdir }), null);
    for (const reference of ["../outside.png", path.join(harness.directory, "outside.png"), ".hidden.png", "https://example.com/image.png"]) {
      assert.equal(await readAssistantImage({ job: { ...job, summary: `![Image](${reference})` }, reference, projectRoot: harness.workdir }), null);
    }
    assert.equal(await readAssistantImage({ job, reference: "image.png", projectRoot: harness.directory }), null);
  } finally { await harness.close(); }
});

test("image cleanup failure releases worker resources and records an actionable event", async () => {
  const harness = await createImageHarness();
  const originalRm = fs.rm;
  const cleanupDirectories = [];
  const previousSession = process.env.FAKE_CODEX_SESSION_ID;
  try {
    await withTemporaryHome(harness.directory, async () => {
      process.env.FAKE_CODEX_SESSION_ID = "12345678-1111-4222-8333-123456789abc";
      setCodexSpawnCompatForTests(createMockCodexSpawn());
      const runner = new JobRunner(harness);
      const job = harness.state.createJob({ id: "cleanup-job", threadId: "thread", projectName: "demo", workdir: harness.workdir, request: "Inspect", status: "queued", images: [png] });
      fs.rm = async (target, options) => {
        if (path.basename(target).startsWith("talkeby-images-")) {
          cleanupDirectories.push(target);
          throw Object.assign(new Error("Locked temporary file"), { code: "EPERM" });
        }
        return originalRm(target, options);
      };
      runner.enqueue(job);
      await runner.queue;
      assert.equal(harness.repository.getJobById(job.id).status, "completed");
      assert.equal(runner.abortControllers.size, 0);
      assert.equal(runner.runningJobIds.size, 0);
      assert.equal(runner.runningThreadKeys.size, 0);
      assert.equal(runner.enqueuedJobIds.size, 0);
      const events = harness.repository.listEventsForJob({ jobId: job.id });
      assert.ok(events.some((event) => event.eventType === "job_cleanup_failed"));
    });
  } finally {
    fs.rm = originalRm;
    setCodexSpawnCompatForTests();
    if (previousSession === undefined) delete process.env.FAKE_CODEX_SESSION_ID;
    else process.env.FAKE_CODEX_SESSION_ID = previousSession;
    for (const directory of cleanupDirectories) await fs.rm(directory, { recursive: true, force: true });
    await harness.close();
  }
});

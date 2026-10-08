import test from "node:test";
import assert from "node:assert/strict";
import { createImageHarness, png } from "./helpers/image-test-harness.mjs";

async function post(harness, url, payload) {
  return harness.app.inject({ method: "POST", url, payload, headers: harness.headers });
}

test("chat history exposes persisted attachment metadata without base64 payloads", async () => {
  const harness = await createImageHarness();
  try {
    const created = await post(harness, "/api/jobs", { task: "Inspect this screenshot", projectName: "demo", threadId: "thread", images: [png] });
    assert.equal(created.statusCode, 200, created.body);
    const history = await harness.app.inject("/api/threads/thread/jobs");
    const [job] = history.json().jobs;
    assert.equal(job.images.length, 1);
    assert.equal(job.images[0].name, png.name);
    assert.equal(job.images[0].data, undefined);
    const image = await harness.app.inject(`/api/jobs/${job.id}/images/${job.images[0].id}`);
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers["cache-control"], "no-store");
    assert.deepEqual(image.rawPayload, Buffer.from(png.data, "base64"));
  } finally { await harness.close(); }
});

test("image jobs retain attachments across approval, denial and retry", async () => {
  const harness = await createImageHarness({ mode: "interactive" });
  try {
    const input = { task: "Inspect this screenshot", projectName: "demo", threadId: "thread", images: [png] };
    const pending = (await post(harness, "/api/jobs", input)).json();
    assert.equal(pending.status, "pending_approval");
    assert.equal(harness.enqueued.length, 0);
    assert.equal((await post(harness, `/api/jobs/${pending.jobId}/approve`, {})).json().status, "queued");
    assert.equal(harness.enqueued.length, 1);
    const denied = (await post(harness, "/api/jobs", input)).json();
    assert.equal((await post(harness, `/api/jobs/${denied.jobId}/deny`, {})).json().status, "denied");
    assert.equal(harness.enqueued.length, 1);
    const retried = (await post(harness, `/api/jobs/${denied.jobId}/retry`, {})).json();
    assert.equal(retried.status, "pending_approval");
    assert.equal(harness.repository.listJobImages(retried.jobId, true)[0].data, png.data);
  } finally { await harness.close(); }
});

test("image API enforces owner auth, CSRF, provider and content validation", async () => {
  const secured = await createImageHarness({ ownerKey: "test-owner-key" });
  try {
    assert.equal((await secured.app.inject("/api/jobs/unknown/images/unknown")).statusCode, 401);
    assert.equal((await secured.app.inject("/api/jobs/unknown/output-image?path=image.png")).statusCode, 401);
  } finally { await secured.close(); }
  const harness = await createImageHarness();
  try {
    const input = { task: "Inspect", projectName: "demo", threadId: "thread", images: [png] };
    assert.equal((await harness.app.inject({ method: "POST", url: "/api/jobs", payload: input })).statusCode, 403);
    for (const image of [{ ...png, mimeType: "image/jpeg" }, { ...png, data: Buffer.from("not an image").toString("base64") }]) {
      assert.equal((await post(harness, "/api/jobs", { ...input, images: [image] })).statusCode, 400);
    }
    harness.state.setProvider("claude");
    assert.equal((await post(harness, "/api/jobs", input)).statusCode, 400);
    assert.equal(harness.state.listJobs().length, 0);
  } finally { await harness.close(); }
});

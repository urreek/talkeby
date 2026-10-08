import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createImageHarness, png } from "./helpers/image-test-harness.mjs";
import { createTalkebySessionFile, withTemporaryHome } from "./helpers/codex-test-utils.mjs";
import { buildCodexTranscriptJobs } from "../src/services/codex-thread-history.mjs";

test("native transcript ids stay stable when earlier turns become persisted jobs", async () => {
  const harness = await createImageHarness();
  try {
    const sessionFilePath = await createTalkebySessionFile({ homeDir: harness.directory, sessionId: "12345678-1111-4222-8333-123456789abc", workdir: harness.workdir, taskMessages: ["First task", "Second task"] });
    const input = { sessionFilePath, threadId: "thread", projectName: "demo", workdir: harness.workdir };
    const before = await buildCodexTranscriptJobs(input);
    const after = await buildCodexTranscriptJobs({ ...input, persistedJobs: [{ request: "First task", createdAt: new Date().toISOString() }] });
    assert.equal(after.length, 1);
    assert.equal(after[0].id, before[1].id);
  } finally { await harness.close(); }
});

test("imported native chat images resolve through its allowlisted saved transcript", async () => {
  const harness = await createImageHarness();
  try {
    await withTemporaryHome(harness.directory, async () => {
      const sessionId = "12345678-1111-4222-8333-123456789abc";
      const sessionFilePath = await createTalkebySessionFile({ homeDir: harness.directory, sessionId, workdir: harness.workdir, taskMessages: ["Show the image"] });
      const rows = (await fs.readFile(sessionFilePath, "utf8")).trim().split("\n").map(JSON.parse);
      rows.find((row) => row.payload?.role === "assistant").payload.content[0].text = "![Output](image.png)";
      await fs.writeFile(sessionFilePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
      await fs.writeFile(path.join(harness.workdir, "image.png"), Buffer.from(png.data, "base64"));
      harness.repository.updateThread("thread", { cliSessionId: sessionId });
      const history = await harness.app.inject("/api/threads/thread/jobs");
      const [job] = history.json().jobs;
      assert.ok(job.id.startsWith("native-"));
      assert.equal(harness.state.getJobById(job.id), null);
      const image = await harness.app.inject(`/api/jobs/${job.id}/output-image?path=image.png`);
      assert.equal(image.statusCode, 200, image.body);
      assert.equal(image.headers["content-type"], "image/png");
      assert.equal(image.headers["cache-control"], "no-store");
      assert.deepEqual(image.rawPayload, Buffer.from(png.data, "base64"));
      assert.equal((await harness.app.inject(`/api/jobs/${job.id}/output-image?path=unreferenced.png`)).statusCode, 404);
      harness.config.workspace.projects.delete("demo");
      assert.equal((await harness.app.inject(`/api/jobs/${job.id}/output-image?path=image.png`)).statusCode, 404);
    });
  } finally { await harness.close(); }
});

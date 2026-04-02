import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { buildCodexTranscriptJobs } from "../src/services/codex-thread-history.mjs";
import { createTalkebySessionFile, withTemporaryHome } from "./helpers/codex-test-utils.mjs";

test("buildCodexTranscriptJobs returns visible native transcript turns and skips persisted Talkeby duplicates", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "talkeby-codex-history-"));
  const workdir = path.join(tempDir, "workdir");
  await fs.mkdir(workdir, { recursive: true });
  const sessionId = "12121212-3434-4567-8888-aaaaaaaaaaaa";

  await withTemporaryHome(tempDir, async () => {
    const sessionFilePath = await createTalkebySessionFile({
      homeDir: tempDir,
      sessionId,
      workdir,
      taskMessages: ["Imported hello", "Later task"],
      originator: "codex desktop",
    });

    const transcriptJobs = await buildCodexTranscriptJobs({
      sessionFilePath,
      threadId: "thread-1",
      projectName: "demo",
      workdir,
      persistedJobs: [
        {
          id: "job-1",
          request: "Later task",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    assert.equal(transcriptJobs.length, 1);
    assert.equal(transcriptJobs[0]?.request, "Imported hello");
    assert.equal(transcriptJobs[0]?.summary, "reply:Imported hello");
    assert.equal(transcriptJobs[0]?.tokenSource, "native_history");
    assert.equal(transcriptJobs[0]?.status, "completed");
  });
});

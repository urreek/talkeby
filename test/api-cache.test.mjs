import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const ts = createRequire(new URL("../web/package.json", import.meta.url))("typescript");
const source = await readFile(new URL("../web/config/api-cache.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { shouldCacheApi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("PWA caching excludes authenticated attachment and output image requests", () => {
  for (const pathname of ["/api/jobs/job/images/image", "/api/jobs/native-thread-1/output-image?path=private.png", "/assets/image.png"]) {
    assert.equal(shouldCacheApi(new URL(pathname, "https://talkeby.test")), false);
  }
  assert.equal(shouldCacheApi(new URL("/api/threads/thread/jobs", "https://talkeby.test")), true);
});

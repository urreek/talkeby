import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const webRequire = createRequire(new URL("../web/package.json", import.meta.url));
const { QueryClient } = webRequire("@tanstack/react-query");
const ts = webRequire("typescript");
const source = await readFile(new URL("../web/src/lib/thread-list.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { sortThreadsNewestFirst, selectCreatedThread } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function thread(id, createdAt, latestJobStatus = null) {
  return { id, projectName: "demo", title: id, createdAt, updatedAt: createdAt, latestJobStatus };
}

test("new chats stay above older active chats even when older chats receive updates", () => {
  const newest = thread("new", "2026-10-08T12:00:00Z");
  const older = ["running", "pending_approval", "queued"].map((status) => ({
    ...thread(status, "2026-10-08T11:00:00Z", status), updatedAt: "2026-10-08T13:00:00Z",
  }));
  const input = [...older, newest];
  assert.equal(sortThreadsNewestFirst(input)[0].id, newest.id);
  assert.equal(input[0].id, "running");
});

test("creating a chat cancels a stale list request and caches it before navigation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const queryKey = ["threads", "demo"];
  const older = thread("old", "2026-10-08T11:00:00Z", "running");
  const newest = thread("new", "2026-10-08T12:00:00Z");
  client.setQueryData(queryKey, { threads: [older] });
  let finishFetch;
  const staleFetch = client.fetchQuery({ queryKey, queryFn: () => new Promise((resolve) => { finishFetch = resolve; }) }).catch(() => {});
  try {
    await selectCreatedThread({ queryClient: client, thread: newest, onSelect: async (selected) => {
      assert.equal(selected.id, newest.id);
      assert.equal(client.isFetching({ queryKey }), 0);
      assert.deepEqual(client.getQueryData(queryKey).threads.map((item) => item.id), ["new", "old"]);
    } });
    finishFetch({ threads: [older] });
    await staleFetch;
    assert.equal(client.getQueryData(queryKey).threads[0].id, newest.id);
  } finally { client.clear(); }
});

test("created chat uses its own project cache and is not duplicated", async () => {
  const client = new QueryClient();
  const newest = thread("new", "2026-10-08T12:00:00Z");
  const other = { threads: [thread("other", "2026-10-08T11:00:00Z")] };
  client.setQueryData(["threads", "other-project"], other);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await selectCreatedThread({ queryClient: client, thread: newest, onSelect: async () => {} });
    }
    assert.equal(client.getQueryData(["threads", "demo"]).threads.length, 1);
    assert.deepEqual(client.getQueryData(["threads", "other-project"]), other);
  } finally { client.clear(); }
});

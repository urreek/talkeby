import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import http from "node:http";
import { createImageHarness } from "./helpers/image-test-harness.mjs";

const require = createRequire(new URL("../web/package.json", import.meta.url));
const { preview } = await import(pathToFileURL(require.resolve("vite")).href);

function statusWithHost(origin, host) {
  return new Promise((resolve, reject) => {
    http.get(origin, { headers: { host } }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    }).once("error", reject);
  });
}

for (const hostname of ["dev.example.ts.net", "talkeby.example.com"]) {
test(`remote preview at ${hostname} enforces hostname, secure login, CSRF and SSE replay`, { timeout: 30_000 }, async () => {
  const harness = await createImageHarness({ mode: "interactive", ownerKey: "fixture-owner" });
  harness.config.storage = { databaseFile: path.join(harness.directory, "db.sqlite") };
  harness.jobRunner.getRunningJobId = () => null;
  const keys = ["PORT", "WEB_PORT", "TALKEBY_WEB_PORT", "TALKEBY_PUBLIC_URL", "TALKEBY_API_ORIGIN", "TALKEBY_BIND_HOST"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let web;
  const abort = new AbortController();
  try {
    await harness.app.listen({ port: 0, host: "127.0.0.1" });
    const dist = path.join(harness.directory, "web-dist");
    await fs.mkdir(dist);
    await fs.writeFile(path.join(dist, "index.html"), "<html><body>Talkeby preview fixture</body></html>");
    process.env.PORT = String(harness.app.server.address().port);
    process.env.WEB_PORT = "5173";
    delete process.env.TALKEBY_WEB_PORT;
    process.env.TALKEBY_PUBLIC_URL = `https://${hostname}`;
    process.env.TALKEBY_API_ORIGIN = `http://127.0.0.1:${process.env.PORT}`;
    process.env.TALKEBY_BIND_HOST = "127.0.0.1";
    web = await preview({ root: fileURLToPath(new URL("../web/", import.meta.url)),
      configFile: fileURLToPath(new URL("../web/vite.config.ts", import.meta.url)),
      build: { outDir: dist }, preview: { port: 0 }, logLevel: "silent" });
    const origin = `http://127.0.0.1:${web.httpServer.address().port}`;
    const headers = { host: hostname, "x-forwarded-proto": "https" };
    assert.equal(await statusWithHost(origin, "evil.example.com"), 403);
    assert.equal(await statusWithHost(origin, hostname), 200);
    assert.equal((await fetch(`${origin}/api/health`, { headers })).status, 401);
    const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ accessKey: "fixture-owner" }) });
    assert.equal(login.status, 200, login.status === 200 ? "" : await login.text());
    assert.match(login.headers.get("set-cookie"), /; Secure/);
    assert.match(login.headers.get("set-cookie"), /; HttpOnly/);
    headers.cookie = login.headers.get("set-cookie").split(";")[0];
    const health = await fetch(`${origin}/api/health`, { headers });
    assert.equal(health.status, 200, health.status === 200 ? "" : await health.text());
    const input = { task: "Preview regression", projectName: "demo", threadId: "thread" };
    const post = () => fetch(`${origin}/api/jobs`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(input) });
    assert.equal((await post()).status, 403);
    headers["x-csrf-token"] = (await (await fetch(`${origin}/api/security/csrf`, { headers })).json()).token;
    const created = await post();
    assert.equal(created.status, 200);
    const job = harness.state.getJobById((await created.json()).jobId);
    assert.ok(job);
    const event = harness.eventBus.publish({ jobId: job.id, chatId: job.chatId, eventType: "remote_test", message: "first", payload: {} });
    const stream = await fetch(`${origin}/api/events?afterEventId=${event.id}`, { headers, signal: abort.signal });
    assert.match(stream.headers.get("content-type"), /text\/event-stream/);
    const reader = stream.body.getReader();
    let received = new TextDecoder().decode((await reader.read()).value);
    assert.match(received, /retry: 5000/);
    assert.equal(received.includes('"message":"first"'), false);
    harness.eventBus.publish({ jobId: job.id, chatId: job.chatId, eventType: "remote_test", message: "second", payload: {} });
    while (!received.includes('"message":"second"')) received += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    const replay = await fetch(`${origin}/api/events`, { headers: { ...headers, "last-event-id": String(event.id) }, signal: abort.signal });
    const replayReader = replay.body.getReader();
    let replayed = "";
    while (!replayed.includes('"message":"second"')) replayed += new TextDecoder().decode((await replayReader.read()).value);
    assert.equal(replayed.includes('"message":"first"'), false);
    await replayReader.cancel();
  } finally {
    abort.abort();
    if (web) {
      web.httpServer.closeAllConnections();
      await new Promise((resolve) => web.httpServer.close(resolve));
    }
    harness.app.server.closeAllConnections();
    await harness.close();
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
}

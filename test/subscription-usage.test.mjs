import test from "node:test";
import assert from "node:assert/strict";
import fastify from "fastify";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { readCodexSubscription } from "../src/providers/codex-subscription.mjs";
import { createSubscriptionUsageService, normalizeSubscriptionLimits } from "../src/services/subscription-usage.mjs";
import { registerSubscriptionRoutes } from "../src/http/subscription-routes.mjs";
import { registerSecurityHooks } from "../src/http/security.mjs";

test("subscription windows prefer all buckets, clamp percentages, and retain unknown values", () => {
  const limits = normalizeSubscriptionLimits({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      codex: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: { usedPercent: null } },
      other: { primary: { usedPercent: 150 }, secondary: { usedPercent: -10 } },
    },
    secret: "must-not-be-exposed",
  });
  assert.equal(limits.length, 2);
  assert.equal(limits[0].primary.remainingPercent, 75);
  assert.equal(limits[0].secondary.remainingPercent, null);
  assert.equal(limits[1].primary.remainingPercent, 0);
  assert.equal(limits[1].secondary.remainingPercent, 100);
  assert.equal(limits[0].primary.resetsAt, new Date(1800000000000).toISOString());
  assert.equal(JSON.stringify(limits).includes("must-not-be-exposed"), false);
  assert.equal(normalizeSubscriptionLimits({ rateLimits: { primary: { usedPercent: 0 } } })[0].primary.remainingPercent, 100);
});

test("usage reads are deduplicated and cached, refresh is throttled, and errors are sanitized", async () => {
  let time = 100_000;
  let calls = 0;
  const service = createSubscriptionUsageService({ config: {}, now: () => time, readLimits: async () => {
    calls++;
    return { rateLimits: { primary: { usedPercent: 40 } } };
  } });
  const results = await Promise.all([service.get("codex"), service.get("codex")]);
  assert.equal(calls, 1);
  assert.equal(results[0].limits[0].primary.remainingPercent, 60);
  await service.get("codex", true);
  assert.equal(calls, 1);
  time += 6_000;
  await service.get("codex", true);
  assert.equal(calls, 2);
  assert.equal((await service.get("claude")).status, "unsupported");
  const failure = createSubscriptionUsageService({ config: {}, readLimits: async () => { throw new Error("secret-token"); } });
  const response = await failure.get("codex");
  assert.equal(response.status, "unavailable");
  assert.equal(JSON.stringify(response).includes("secret-token"), false);
  const empty = createSubscriptionUsageService({ config: {}, readLimits: async () => ({ rateLimits: { primary: { usedPercent: null } } }) });
  assert.equal((await empty.get("codex")).status, "unavailable");
});

function fakeCodex(respond) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  child.stdin.on("data", (chunk) => respond(JSON.parse(chunk.toString()), child));
  return child;
}

test("Codex usage uses read-only RPC and cleans up on success and timeout", async () => {
  const methods = [];
  const child = fakeCodex((message, process) => {
    methods.push(message.method);
    if (!message.id) return;
    queueMicrotask(() => process.stdout.write(JSON.stringify({ id: message.id, result: message.method === "initialize" ? {} : { rateLimits: { primary: { usedPercent: 12 } } } }) + "\n"));
  });
  const result = await readCodexSubscription({ binary: "codex", workdir: "." }, { spawn: () => child });
  assert.equal(result.rateLimits.primary.usedPercent, 12);
  assert.deepEqual(methods, ["initialize", "initialized", "account/rateLimits/read"]);
  assert.equal(child.killed, true);
  const stuck = fakeCodex(() => {});
  await assert.rejects(readCodexSubscription({ binary: "codex" }, { spawn: () => stuck, timeoutMs: 10 }), /connection failed/);
  assert.equal(stuck.killed, true);
});

test("subscription route validates providers and existing owner auth blocks access before reading usage", async () => {
  let calls = 0;
  const service = { get: async (provider) => { calls++; return { provider, status: "unsupported", checkedAt: null, message: "Unavailable", limits: [], secret: "hidden" }; } };
  const app = fastify();
  registerSubscriptionRoutes(app, {}, service);
  assert.equal((await app.inject("/api/subscription-usage?provider=invalid")).statusCode, 400);
  const response = await app.inject("/api/subscription-usage?provider=claude");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.json().secret, undefined);
  assert.equal(calls, 1);
  await app.close();
  const secured = fastify();
  registerSecurityHooks({ app: secured, config: { security: { ownerKey: "test-key", csrfSecret: "test-secret", rateLimitPerMinute: 100, sessionTtlMs: 60000, csrfTtlMs: 60000, sessionCookieName: "owner_session" } } });
  registerSubscriptionRoutes(secured, {}, service);
  assert.equal((await secured.inject("/api/subscription-usage?provider=codex")).statusCode, 401);
  assert.equal(calls, 1);
  await secured.close();
});

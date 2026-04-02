import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { TerminalManager } from "../src/services/terminal-manager.mjs";

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    writable: true,
    writes: [],
    write(value) {
      this.writes.push(String(value));
    },
  };
  child.kill = () => {
    child.emit("close", 0);
  };
  return child;
}

test("TerminalManager starts a session, records output, input, and exit events", () => {
  const child = createFakeChild();
  const manager = new TerminalManager({
    defaultCwd: process.cwd(),
    spawnFn: () => child,
  });

  const session = manager.ensureSession();
  assert.equal(session?.status, "running");

  child.stdout.emit("data", Buffer.from("hello from stdout\r\n"));
  child.stderr.emit("data", Buffer.from("problem line\r\n"));
  manager.writeInput("dir\n");
  child.emit("close", 0);

  const events = manager.listEventsAfter({ afterEventId: 0, limit: 20 });
  assert.equal(events[0]?.eventType, "terminal_status");
  assert.equal(events[1]?.stream, "stdout");
  assert.match(events[1]?.data || "", /hello from stdout/);
  assert.equal(events[2]?.stream, "stderr");
  assert.equal(events[3]?.eventType, "terminal_input");
  assert.equal(events[4]?.eventType, "terminal_exit");
  assert.equal(manager.getSession()?.status, "closed");
  assert.deepEqual(child.stdin.writes, ["dir\n"]);
});

test("TerminalManager returns terminal events after a specific event id", () => {
  const child = createFakeChild();
  const manager = new TerminalManager({
    defaultCwd: process.cwd(),
    spawnFn: () => child,
  });

  manager.ensureSession();
  child.stdout.emit("data", Buffer.from("one\n"));
  child.stdout.emit("data", Buffer.from("two\n"));

  const allEvents = manager.listEventsAfter({ afterEventId: 0, limit: 20 });
  const tailEvents = manager.listEventsAfter({ afterEventId: allEvents[1].id, limit: 20 });

  assert.equal(tailEvents.length, 1);
  assert.match(tailEvents[0]?.data || "", /two/);
});

test("TerminalManager treats clear commands as a terminal clear without writing to stdin", () => {
  const child = createFakeChild();
  const manager = new TerminalManager({
    defaultCwd: process.cwd(),
    spawnFn: () => child,
  });

  manager.ensureSession();
  child.stdout.emit("data", Buffer.from("before clear\n"));
  manager.writeInput("clear\n");

  const events = manager.listEventsAfter({ afterEventId: 0, limit: 20 });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "terminal_clear");
  assert.deepEqual(child.stdin.writes, []);
});

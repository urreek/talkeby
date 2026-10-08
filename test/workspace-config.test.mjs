import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeState } from "../src/services/runtime-state.mjs";

test("legacy Codex project configuration remains available to runtime services", () => {
  const projects = new Map([["legacy", "C:/legacy"]]);
  const state = new RuntimeState({ config: { codex: { projects, defaultProjectName: "legacy" } }, repository: {} });
  assert.equal(state.config.workspace.projects, projects);
  assert.equal(state.config.workspace.defaultProjectName, "legacy");
});

test("workspace configuration takes precedence over legacy Codex projects", () => {
  const projects = new Map([["current", "C:/current"]]);
  const state = new RuntimeState({ config: {
    workspace: { projects, defaultProjectName: "current" },
    codex: { projects: new Map([["legacy", "C:/legacy"]]), defaultProjectName: "legacy" },
  }, repository: {} });
  assert.equal(state.config.workspace.projects, projects);
  assert.equal(state.config.workspace.defaultProjectName, "current");
});

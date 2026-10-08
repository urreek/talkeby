import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const ts = createRequire(new URL("../web/package.json", import.meta.url))("typescript");
const source = await readFile(new URL("../web/config/web-port.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { webPortOptions } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("web startup always uses a fixed strict port", () => {
  assert.deepEqual(webPortOptions({}), { port: 5173, strictPort: true });
  assert.deepEqual(webPortOptions({ WEB_PORT: "5200" }), { port: 5200, strictPort: true });
  assert.deepEqual(webPortOptions({ TALKEBY_WEB_PORT: "5300", WEB_PORT: "5200" }), { port: 5300, strictPort: true });
  assert.deepEqual(webPortOptions({ TALKEBY_WEB_PORT: " ", WEB_PORT: "5200" }), { port: 5200, strictPort: true });
});

test("invalid web ports fail instead of changing the address", () => {
  for (const value of ["0", "65536", "-1", "5173x", "5173.5", "Infinity"]) {
    assert.throws(() => webPortOptions({ TALKEBY_WEB_PORT: value }), /Invalid web port/);
  }
});

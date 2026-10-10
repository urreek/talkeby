import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function ask(question, fallback = "", secret = false) {
  if (!process.stdin.isTTY) throw new Error("Remote setup needs an interactive terminal. Run this command in PowerShell or your terminal.");
  let muted = false;
  const output = new Writable({ write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  } });
  const readline = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write(question);
    muted = secret;
    const answer = await readline.question("");
    if (secret) process.stdout.write("\n");
    return answer.trim() || fallback;
  } finally { readline.close(); }
}

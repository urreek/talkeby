import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { threadsTable } from "./schema.mjs";

export function createImportedThread(repository, input) {
  const cliSessionId = String(input.cliSessionId || "").trim();
  if (!cliSessionId) throw new Error("Imported threads require a Codex session ID.");

  return repository.db.transaction((tx) => {
    const existing = repository.getThreadByCliSessionId(cliSessionId);
    if (existing) return existing;

    // A thread keeps its identity when its native session changes. Inspect the
    // stored primary key directly, including merged aliases and archived rows.
    let id = String(input.id || cliSessionId);
    while (tx.select({ id: threadsTable.id }).from(threadsTable)
      .where(eq(threadsTable.id, id)).limit(1).get()) {
      id = randomUUID();
    }
    return repository.createThread({ ...input, id, cliSessionId });
  }, { behavior: "immediate" });
}

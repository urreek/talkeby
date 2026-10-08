import { buildCodexTranscriptJobs } from "./codex-thread-history.mjs";
import { inspectCodexSession } from "./codex-sessions.mjs";

export async function resolveAssistantImageJob({ jobId, state, repository, projects }) {
  const saved = state.getJobById(jobId);
  if (saved) return saved;

  const match = /^native-(.+)-([1-9]\d*)$/.exec(String(jobId || ""));
  if (!match || !repository) return null;
  const thread = repository.getThread(match[1]);
  const workdir = projects.get(thread?.projectName);
  if (!thread || thread.status !== "active" || !thread.cliSessionId || !workdir) return null;

  const session = await inspectCodexSession({ sessionId: thread.cliSessionId, workdir });
  if (!session) return null;
  const jobs = await buildCodexTranscriptJobs({
    sessionFilePath: session.filePath,
    threadId: thread.id,
    projectName: thread.projectName,
    workdir,
    persistedJobs: repository.listJobsByThread(thread.id),
  });
  return jobs.find((job) => job.id === jobId) || null;
}

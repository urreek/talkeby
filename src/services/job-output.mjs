/**
 * In-memory store for live output lines per job.
 * Subscribers get notified on new lines via callback.
 */
const jobOutputs = new Map();

export function getJobOutput(jobId) {
  return jobOutputs.get(jobId)?.lines ?? [];
}

export function appendJobOutput(jobId, line) {
  if (!jobOutputs.has(jobId)) {
    jobOutputs.set(jobId, { lines: [], listeners: new Set() });
  }
  const entry = jobOutputs.get(jobId);
  entry.lines.push(line);
  // Keep last 500 lines per job
  if (entry.lines.length > 500) {
    entry.lines.splice(0, entry.lines.length - 500);
  }
  for (const fn of entry.listeners) {
    try { fn(line); } catch { /* ignore */ }
  }
}

export function subscribeJobOutput(jobId, callback) {
  if (!jobOutputs.has(jobId)) {
    jobOutputs.set(jobId, { lines: [], listeners: new Set() });
  }
  const entry = jobOutputs.get(jobId);
  entry.listeners.add(callback);
  return () => entry.listeners.delete(callback);
}

export function clearJobOutput(jobId) {
  jobOutputs.delete(jobId);
}

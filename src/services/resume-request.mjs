export const RESUME_FROM_ERROR_TASK = "Continue from the last error in this thread and fix it.";

export function isGeneratedResumeTask(task) {
  return String(task || "").trim() === RESUME_FROM_ERROR_TASK;
}

export function resolveResumeSourceTask({ job, getJobById }) {
  let current = job;
  const seen = new Set();

  while (current && current.id && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    const request = String(current.request || "").trim();
    if (request && !isGeneratedResumeTask(request)) {
      return request;
    }

    const previousId = String(current.resumedFromJobId || "").trim();
    if (!previousId || typeof getJobById !== "function") {
      break;
    }
    current = getJobById(previousId);
  }

  const fallback = String(job?.request || "").trim();
  if (fallback && !isGeneratedResumeTask(fallback)) {
    return fallback;
  }
  return "";
}

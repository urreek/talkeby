import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveJob,
  createJob,
  denyJob,
  fetchJobs,
  fetchMode,
  fetchProjects
} from "@/lib/api";
import { subscribeJobEvents } from "@/lib/events";

export function useJobsScreenData(chatId: string) {
  const queryClient = useQueryClient();
  const hasChatId = chatId.length > 0;

  const jobsQuery = useQuery({
    queryKey: ["jobs", chatId],
    queryFn: () => fetchJobs({ chatId, limit: 120 }),
    enabled: hasChatId
  });

  const modeQuery = useQuery({
    queryKey: ["mode", chatId],
    queryFn: () => fetchMode(chatId),
    enabled: hasChatId
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", chatId],
    queryFn: () => fetchProjects(chatId),
    enabled: hasChatId
  });

  useEffect(() => {
    if (!chatId) {
      return undefined;
    }

    return subscribeJobEvents({
      chatId,
      onEvent: () => {
        queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
      }
    });
  }, [chatId, queryClient]);

  const createMutation = useMutation({
    mutationFn: (input: { task: string; projectName: string }) =>
      createJob({ chatId, task: input.task, projectName: input.projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    }
  });

  const approveMutation = useMutation({
    mutationFn: (jobId: string) => approveJob({ chatId, jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    }
  });

  const denyMutation = useMutation({
    mutationFn: (jobId: string) => denyJob({ chatId, jobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    }
  });

  const jobs = jobsQuery.data ?? [];
  const pendingJobs = useMemo(
    () => jobs.filter((job) => job.status === "pending_approval"),
    [jobs]
  );

  const errorMessage =
    getErrorMessage(createMutation.error) ||
    getErrorMessage(approveMutation.error) ||
    getErrorMessage(denyMutation.error) ||
    getErrorMessage(jobsQuery.error) ||
    getErrorMessage(projectsQuery.error) ||
    getErrorMessage(modeQuery.error) ||
    "";

  return {
    jobs,
    pendingJobs,
    currentMode: modeQuery.data?.executionMode ?? "auto",
    activeProject: projectsQuery.data?.activeProject ?? "default",
    availableProjects: projectsQuery.data?.projects ?? [],
    createMutation,
    approveMutation,
    denyMutation,
    errorMessage
  };
}

function getErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : "";
}

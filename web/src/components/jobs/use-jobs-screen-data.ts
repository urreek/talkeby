import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveJob,
  createJob,
  denyJob,
  fetchJobs,
  fetchMode,
  fetchProjects,
  selectProject
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

  const selectProjectMutation = useMutation({
    mutationFn: (projectName: string) => selectProject({ chatId, projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", chatId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    }
  });

  const jobs = jobsQuery.data ?? [];
  const projects = projectsQuery.data?.projects ?? [];
  const activeProject = projectsQuery.data?.activeProject;
  const normalizedActiveProject = projects.some((project) => project.name === activeProject)
    ? String(activeProject)
    : "";

  const projectJobs = useMemo(
    () =>
      normalizedActiveProject
        ? jobs.filter((job) => job.projectName === normalizedActiveProject)
        : jobs,
    [jobs, normalizedActiveProject]
  );

  const pendingJobs = useMemo(
    () => projectJobs.filter((job) => job.status === "pending_approval"),
    [projectJobs]
  );

  const errorMessage =
    getErrorMessage(createMutation.error) ||
    getErrorMessage(approveMutation.error) ||
    getErrorMessage(denyMutation.error) ||
    getErrorMessage(selectProjectMutation.error) ||
    getErrorMessage(jobsQuery.error) ||
    getErrorMessage(projectsQuery.error) ||
    getErrorMessage(modeQuery.error) ||
    "";

  return {
    jobs: projectJobs,
    latestJob: jobs[0],
    pendingJobs,
    currentMode: modeQuery.data?.executionMode ?? "auto",
    activeProject: normalizedActiveProject,
    availableProjects: projects,
    createMutation,
    approveMutation,
    denyMutation,
    selectProjectMutation,
    errorMessage
  };
}

function getErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : "";
}

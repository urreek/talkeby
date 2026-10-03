import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteProject } from "@/lib/api";
import type { ProjectsResponse } from "@/lib/types";

export function useDeleteProject(confirm: ReturnType<typeof useConfirmDialog>["confirm"]) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      queryClient.setQueryData<ProjectsResponse>(["projects"], (previous) => ({
        basePath: previous?.basePath ?? "",
        projects: data.projects,
        activeProject: data.activeProject,
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["discover-projects"] }),
      ]);
    },
  });

  const requestDelete = async (projectName: string) => {
    if (mutation.isPending) return;
    mutation.reset();
    const confirmed = await confirm({
      title: `Delete project "${projectName}"?`,
      description: "This removes the project from Talkeby. Files on disk and thread history are kept. You can add the project again from Settings.",
      confirmLabel: "Delete project",
      variant: "destructive",
    });
    if (confirmed) mutation.mutate(projectName);
  };

  return {
    requestDelete,
    isDeleting: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : "",
  };
}

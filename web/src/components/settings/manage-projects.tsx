import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteProject, fetchProjects } from "@/lib/api";

type ManageProjectsProps = {
  chatId: string;
};

export function ManageProjects({ chatId }: ManageProjectsProps) {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["projects", chatId],
    queryFn: () => fetchProjects(chatId),
  });

  const removeMutation = useMutation({
    mutationFn: (name: string) => deleteProject(name, chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["discover-projects"] });
    },
  });

  const projects = projectsQuery.data?.projects ?? [];

  if (projects.length === 0) return null;

  return (
    <Card className="theme-surface">
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          Remove a project to hide it from the web app. The folder stays on
          disk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {projects.map((project) => (
          <div
            key={project.name}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{project.name}</p>
              <p className="text-xs text-muted-foreground">{project.path}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(project.name)}
            >
              Remove
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

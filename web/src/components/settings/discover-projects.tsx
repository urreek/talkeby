import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addProject, deleteProject, discoverProjects } from "@/lib/api";

export function DiscoverProjects() {
  const queryClient = useQueryClient();

  const discoverQuery = useQuery({
    queryKey: ["discover-projects"],
    queryFn: discoverProjects,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const addMutation = useMutation({
    mutationFn: (input: { name: string; path: string }) =>
      addProject({ projectName: input.name, path: input.path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["discover-projects"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (name: string) => deleteProject(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["discover-projects"] });
    },
  });

  const data = discoverQuery.data;
  if (!data) {
    return (
      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Discover Projects</CardTitle>
          <CardDescription>Scanning project folders...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const actionError = (addMutation.error || removeMutation.error) instanceof Error
    ? ((addMutation.error || removeMutation.error) as Error).message
    : "";

  return (
    <Card className="theme-surface min-w-0">
      <CardHeader>
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <CardTitle>Discover Projects</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="w-full bg-background sm:w-auto"
            disabled={discoverQuery.isFetching}
            onClick={() => discoverQuery.refetch()}
          >
            {discoverQuery.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        <CardDescription>
          Folders found in {" "}
          <code className="inline-block max-w-full break-all rounded bg-muted px-1 text-xs align-middle">
            {data.basePath}
          </code>
          . Tap Add on a folder to make it selectable in Jobs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.discovered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No folders found right now. Create a folder inside this base path and tap Refresh.
          </p>
        ) : (
          data.discovered.map((project) => (
            <div
              key={project.name}
              className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{project.name}</p>
                  {project.alreadyAdded ? (
                    <Badge variant="secondary">Added</Badge>
                  ) : null}
                </div>
                <p className="break-all text-xs text-muted-foreground">{project.path}</p>
              </div>
              <Button
                size="sm"
                variant={project.alreadyAdded ? "destructive" : "outline"}
                className="w-full shrink-0 bg-background sm:w-auto"
                disabled={addMutation.isPending || removeMutation.isPending}
                onClick={() => {
                  if (project.alreadyAdded) {
                    removeMutation.mutate(project.suggestedProjectName || project.name);
                    return;
                  }
                  addMutation.mutate({
                    name: project.suggestedProjectName || project.name,
                    path: project.path,
                  });
                }}
              >
                {project.alreadyAdded ? "Remove" : "Add"}
              </Button>
            </div>
          ))
        )}
        {actionError ? (
          <p className="text-sm font-medium text-destructive">{actionError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

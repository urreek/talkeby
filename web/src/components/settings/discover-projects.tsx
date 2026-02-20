import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addProject, discoverProjects } from "@/lib/api";
import { getStoredChatId } from "@/lib/storage";

export function DiscoverProjects() {
  const queryClient = useQueryClient();
  const chatId = getStoredChatId();

  const discoverQuery = useQuery({
    queryKey: ["discover-projects"],
    queryFn: discoverProjects,
  });

  const addMutation = useMutation({
    mutationFn: (input: { name: string; path: string }) =>
      addProject({ chatId, projectName: input.name, path: input.path }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["discover-projects"] });
    },
  });

  const data = discoverQuery.data;
  if (!data) return null;

  const notAdded = data.discovered.filter((d) => !d.alreadyAdded);

  if (notAdded.length === 0) {
    return null;
  }

  return (
    <Card className="theme-surface">
      <CardHeader>
        <CardTitle>Discover Projects</CardTitle>
        <CardDescription>
          Folders found in{" "}
          <code className="rounded bg-muted px-1 text-xs">{data.basePath}</code>
          . Click to add.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {notAdded.map((project) => (
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
              variant="outline"
              disabled={addMutation.isPending}
              onClick={() =>
                addMutation.mutate({ name: project.name, path: project.path })
              }
            >
              Add
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { SettingsPanel } from "@/components/settings/settings-panel";
import { Card, CardContent } from "@/components/ui/card";
import { fetchMode, fetchProjects, selectProject, setMode } from "@/lib/api";
import { getStoredChatId, setStoredChatId } from "@/lib/storage";
import type { ExecutionMode } from "@/lib/types";
import { rootRoute } from "@/routes/__root";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsScreen
});

function SettingsScreen() {
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState(() => getStoredChatId());

  const hasChatId = chatId.length > 0;

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

  const modeMutation = useMutation({
    mutationFn: (mode: ExecutionMode) => setMode({ chatId, mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mode", chatId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    }
  });

  const projectMutation = useMutation({
    mutationFn: (projectName: string) => selectProject({ chatId, projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", chatId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    }
  });

  const errorMessage =
    getErrorMessage(modeMutation.error) ||
    getErrorMessage(projectMutation.error) ||
    getErrorMessage(projectsQuery.error) ||
    getErrorMessage(modeQuery.error) ||
    "";

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent>
            <p className="text-sm text-destructive">{errorMessage}</p>
          </CardContent>
        </Card>
      ) : null}

      <SettingsPanel
        initialChatId={chatId}
        mode={modeQuery.data?.executionMode ?? "auto"}
        activeProject={projectsQuery.data?.activeProject ?? "default"}
        projects={projectsQuery.data?.projects ?? []}
        onSaveChatId={(nextChatId) => {
          const normalized = nextChatId.trim();
          if (!normalized) {
            return;
          }
          setStoredChatId(normalized);
          setChatId(normalized);
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }}
        onChangeMode={(mode) => modeMutation.mutate(mode)}
        onChangeProject={(projectName) => projectMutation.mutate(projectName)}
        isUpdatingMode={modeMutation.isPending}
        isUpdatingProject={projectMutation.isPending}
      />
    </div>
  );
}

function getErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : "";
}

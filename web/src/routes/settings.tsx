import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";

import { DiscoverProjects } from "@/components/settings/discover-projects";
import { ProviderHealth } from "@/components/settings/provider-health";
import { ProviderSetup } from "@/components/settings/provider-setup";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  addProject,
  fetchAgentProfile,
  fetchMode,
  fetchProviderCatalog,
  fetchProjects,
  fetchProvider,
  selectProject,
  setAgentProfile,
  setMode,
  setProvider,
} from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { isSoundsEnabled, setSoundsEnabled, playCompleted } from "@/lib/sounds";
import { getStoredChatId, setStoredChatId } from "@/lib/storage";
import type { AIProvider, ExecutionMode } from "@/lib/types";
import { rootRoute } from "@/routes/__root";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsScreen,
});

function SettingsScreen() {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [chatId, setChatId] = useState(() => getStoredChatId());

  const modeQuery = useQuery({
    queryKey: ["mode", chatId],
    queryFn: () => fetchMode(chatId),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", chatId],
    queryFn: () => fetchProjects(chatId),
  });

  const providerQuery = useQuery({
    queryKey: ["provider"],
    queryFn: () => fetchProvider(),
  });
  const providerCatalogQuery = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: fetchProviderCatalog,
  });
  const agentProfileQuery = useQuery({
    queryKey: ["agent-profile", chatId],
    queryFn: () => fetchAgentProfile(chatId),
  });

  const modeMutation = useMutation({
    mutationFn: (mode: ExecutionMode) => setMode({ chatId, mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mode", chatId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    },
  });

  const providerMutation = useMutation({
    mutationFn: (provider: AIProvider) => setProvider({ chatId, provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider"] });
    },
  });

  const projectMutation = useMutation({
    mutationFn: (projectName: string) => selectProject({ chatId, projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", chatId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    },
  });

  const addProjectMutation = useMutation({
    mutationFn: (input: { projectName: string; path?: string }) =>
      addProject({
        chatId,
        projectName: input.projectName,
        path: input.path,
        setActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", chatId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", chatId] });
    },
  });
  const agentProfileMutation = useMutation({
    mutationFn: (profile: string) => setAgentProfile({ chatId, profile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-profile", chatId] });
    },
  });

  const errorMessage =
    getErrorMessage(modeMutation.error) ||
    getErrorMessage(providerMutation.error) ||
    getErrorMessage(projectMutation.error) ||
    getErrorMessage(addProjectMutation.error) ||
    getErrorMessage(agentProfileMutation.error) ||
    getErrorMessage(providerCatalogQuery.error) ||
    getErrorMessage(agentProfileQuery.error) ||
    getErrorMessage(projectsQuery.error) ||
    getErrorMessage(modeQuery.error) ||
    "";
  const projects = projectsQuery.data?.projects ?? [];
  const projectsBasePath = projectsQuery.data?.basePath ?? "";
  const fetchedActiveProject = projectsQuery.data?.activeProject;
  const activeProject = projects.some(
    (project) => project.name === fetchedActiveProject,
  )
    ? String(fetchedActiveProject)
    : "";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
      {errorMessage ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </CardContent>
        </Card>
      ) : null}

      <ProviderHealth />
      <ProviderSetup />

      <DiscoverProjects chatId={chatId} />

      <SoundsToggle />

      <SettingsPanel
        initialChatId={chatId}
        mode={modeQuery.data?.executionMode ?? "auto"}
        provider={providerQuery.data?.provider ?? "codex"}
        model={providerQuery.data?.model ?? ""}
        reasoningEffort={providerQuery.data?.reasoningEffort ?? ""}
        planMode={providerQuery.data?.planMode ?? false}
        providerCatalog={providerCatalogQuery.data?.providers ?? []}
        activeProject={activeProject}
        projects={projects}
        projectsBasePath={projectsBasePath}
        theme={theme}
        initialAgentProfile={agentProfileQuery.data?.profile ?? ""}
        onSaveChatId={(nextChatId) => {
          const normalized = nextChatId.trim();
          if (!normalized) {
            return;
          }
          setStoredChatId(normalized);
          setChatId(normalized);
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }}
        onSaveAgentProfile={async (profile) => {
          await agentProfileMutation.mutateAsync(profile);
        }}
        onChangeTheme={setTheme}
        onChangeMode={(mode) => modeMutation.mutate(mode)}
        onChangeProvider={(provider) => providerMutation.mutate(provider)}
        onChangeModel={(model) =>
          setProvider({
            chatId,
            model: model === "__default__" ? "" : model,
          }).then(() =>
            queryClient.invalidateQueries({ queryKey: ["provider"] }),
          )
        }
        onChangeReasoningEffort={(effort) =>
          setProvider({ chatId, reasoningEffort: effort }).then(() =>
            queryClient.invalidateQueries({ queryKey: ["provider"] }),
          )
        }
        onChangePlanMode={(enabled) =>
          setProvider({ chatId, planMode: enabled }).then(() =>
            queryClient.invalidateQueries({ queryKey: ["provider"] }),
          )
        }
        onChangeProject={(projectName) => projectMutation.mutate(projectName)}
        onAddProject={async (input) => {
          await addProjectMutation.mutateAsync(input);
        }}
        isUpdatingMode={modeMutation.isPending}
        isUpdatingProvider={providerMutation.isPending}
        isUpdatingProject={projectMutation.isPending}
        isAddingProject={addProjectMutation.isPending}
        isSavingAgentProfile={agentProfileMutation.isPending}
      />
    </div>
  );
}

function SoundsToggle() {
  const [enabled, setEnabled] = useState(isSoundsEnabled());

  return (
    <Card className="theme-surface">
      <CardHeader>
        <CardTitle>Sound Effects</CardTitle>
        <CardDescription>
          Play sounds when jobs complete, fail, or need approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Button
          size="sm"
          variant={enabled ? "default" : "outline"}
          onClick={() => {
            const next = !enabled;
            setSoundsEnabled(next);
            setEnabled(next);
            if (next) playCompleted();
          }}
        >
          {enabled ? "🔔 Enabled" : "🔕 Disabled"}
        </Button>
        {enabled && (
          <Button size="sm" variant="ghost" onClick={() => playCompleted()}>
            Test
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function getErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : "";
}

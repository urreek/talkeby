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
  fetchMode,
  fetchProviderCatalog,
  fetchProjects,
  fetchProvider,
  fetchSessionStatus,
  logout,
  selectProject,
  setMode,
  setProvider,
} from "@/lib/api";
import { isSoundsEnabled, playCompleted, setSoundsEnabled } from "@/lib/sounds";
import { useTheme } from "@/lib/theme";
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

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchSessionStatus,
  });

  const modeQuery = useQuery({
    queryKey: ["mode"],
    queryFn: fetchMode,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const providerQuery = useQuery({
    queryKey: ["provider"],
    queryFn: fetchProvider,
  });

  const providerCatalogQuery = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: fetchProviderCatalog,
  });

  const modeMutation = useMutation({
    mutationFn: (mode: ExecutionMode) => setMode({ mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mode"] });
    },
  });

  const providerMutation = useMutation({
    mutationFn: (provider: AIProvider) => setProvider({ provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider"] });
    },
  });

  const projectMutation = useMutation({
    mutationFn: (projectName: string) => selectProject({ projectName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const addProjectMutation = useMutation({
    mutationFn: (input: { projectName: string; path?: string }) =>
      addProject({
        projectName: input.projectName,
        path: input.path,
        setActive: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/");
    },
  });

  const errorMessage =
    getErrorMessage(sessionQuery.error) ||
    getErrorMessage(modeMutation.error) ||
    getErrorMessage(providerMutation.error) ||
    getErrorMessage(projectMutation.error) ||
    getErrorMessage(addProjectMutation.error) ||
    getErrorMessage(providerCatalogQuery.error) ||
    getErrorMessage(projectsQuery.error) ||
    getErrorMessage(modeQuery.error) ||
    "";

  const projects = projectsQuery.data?.projects ?? [];
  const projectsBasePath = projectsQuery.data?.basePath ?? "";
  const fetchedActiveProject = projectsQuery.data?.activeProject;
  const activeProject = projects.some((project) => project.name === fetchedActiveProject)
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

      <DiscoverProjects />

      <SoundsToggle />

      <SettingsPanel
        mode={modeQuery.data?.executionMode ?? "auto"}
        provider={providerQuery.data?.provider ?? "codex"}
        model={providerQuery.data?.model ?? ""}
        reasoningEffort={providerQuery.data?.reasoningEffort ?? ""}
        planMode={providerQuery.data?.planMode ?? false}
        codexParityMode={providerQuery.data?.codexParityMode}
        codexSessionResumeEnabled={providerQuery.data?.codexSessionResumeEnabled}
        providerCatalog={providerCatalogQuery.data?.providers ?? []}
        activeProject={activeProject}
        projects={projects}
        projectsBasePath={projectsBasePath}
        theme={theme}
        showLogout={Boolean(sessionQuery.data?.required)}
        onLogout={() => logoutMutation.mutate()}
        onChangeTheme={setTheme}
        onChangeMode={(mode) => modeMutation.mutate(mode)}
        onChangeProvider={(provider) => providerMutation.mutate(provider)}
        onChangeModel={(model) =>
          setProvider({
            model: model === "__default__" ? "" : model,
          }).then(() =>
            queryClient.invalidateQueries({ queryKey: ["provider"] }),
          )
        }
        onChangeReasoningEffort={(effort) =>
          setProvider({ reasoningEffort: effort }).then(() =>
            queryClient.invalidateQueries({ queryKey: ["provider"] }),
          )
        }
        onChangePlanMode={(enabled) =>
          setProvider({ planMode: enabled }).then(() =>
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
        isLoggingOut={logoutMutation.isPending}
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
          {enabled ? "Enabled" : "Disabled"}
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

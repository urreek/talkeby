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
    getErrorMessage(addProjectMutation.error) ||
    getErrorMessage(providerCatalogQuery.error) ||
    getErrorMessage(projectsQuery.error) ||
    getErrorMessage(modeQuery.error) ||
    "";

  const projects = projectsQuery.data?.projects ?? [];
  const projectsBasePath = projectsQuery.data?.basePath ?? "";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-4 sm:px-4 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
      {errorMessage ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <ProviderHealth />
        <ProviderSetup />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DiscoverProjects />
        <SoundsToggle />
      </div>

      <SettingsPanel
        mode={modeQuery.data?.executionMode ?? "auto"}
        provider={providerQuery.data?.provider ?? "codex"}
        model={providerQuery.data?.model ?? ""}
        reasoningEffort={providerQuery.data?.reasoningEffort ?? ""}
        planMode={providerQuery.data?.planMode ?? false}
        codexParityMode={providerQuery.data?.codexParityMode}
        codexSessionResumeEnabled={providerQuery.data?.codexSessionResumeEnabled}
        providerCatalog={providerCatalogQuery.data?.providers ?? []}
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
        onAddProject={async (input) => {
          await addProjectMutation.mutateAsync(input);
        }}
        isUpdatingMode={modeMutation.isPending}
        isUpdatingProvider={providerMutation.isPending}
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
      <CardContent className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Button
          size="sm"
          className="w-full sm:w-auto"
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
          <Button
            size="sm"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => playCompleted()}
          >
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
